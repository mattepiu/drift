//! Full pipeline benchmarks
//!
//! Benchmarks the complete analysis pipeline: scan -> parse -> analyze

use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};
use drift_core::scanner::{Scanner, ScanConfig};
use drift_core::parsers::ParserManager;
use drift_core::call_graph::{StreamingBuilder, BuilderConfig};
use drift_core::boundaries::BoundaryScanner;
use drift_core::coupling::CouplingAnalyzer;
use drift_core::test_topology::TestTopologyAnalyzer;
use drift_core::error_handling::ErrorHandlingAnalyzer;
use std::path::PathBuf;
use tempfile::TempDir;
use std::fs;

fn create_test_project() -> TempDir {
    let dir = TempDir::new().unwrap();
    
    // Create a realistic project structure
    let src = dir.path().join("src");
    fs::create_dir_all(&src).unwrap();
    
    // TypeScript files
    fs::write(src.join("index.ts"), r#"
import { UserService } from './services/user.service';
import { AuthMiddleware } from './middleware/auth';

export { UserService, AuthMiddleware };
"#).unwrap();
    
    fs::create_dir_all(src.join("services")).unwrap();
    fs::write(src.join("services/user.service.ts"), r#"
import { prisma } from '../db';
import { User } from '../types';

export class UserService {
    async findById(id: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { id } });
    }
    
    async create(data: { email: string; name: string }): Promise<User> {
        return prisma.user.create({ data });
    }
    
    async delete(id: string): Promise<void> {
        await prisma.user.delete({ where: { id } });
    }
}
"#).unwrap();
    
    fs::create_dir_all(src.join("middleware")).unwrap();
    fs::write(src.join("middleware/auth.ts"), r#"
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export async function AuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }
        const decoded = await verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}
"#).unwrap();
    
    // Test files
    fs::create_dir_all(src.join("__tests__")).unwrap();
    fs::write(src.join("__tests__/user.service.test.ts"), r#"
import { describe, it, expect, vi } from 'vitest';
import { UserService } from '../services/user.service';

vi.mock('../db');

describe('UserService', () => {
    it('should find user by id', async () => {
        const service = new UserService();
        const user = await service.findById('123');
        expect(user).toBeDefined();
    });
    
    it('should create user', async () => {
        const service = new UserService();
        const user = await service.create({ email: 'test@test.com', name: 'Test' });
        expect(user.email).toBe('test@test.com');
    });
});
"#).unwrap();
    
    dir
}

fn bench_scanner(c: &mut Criterion) {
    let dir = create_test_project();
    
    c.bench_function("scan_project", |b| {
        b.iter(|| {
            let config = ScanConfig {
                root: dir.path().to_path_buf(),
                patterns: vec!["**/*.ts".to_string()],
                extra_ignores: vec![],
                compute_hashes: true,
                max_file_size: 10 * 1024 * 1024,
                threads: 0,
            };
            let scanner = Scanner::new(config);
            scanner.scan()
        })
    });
}

fn bench_parse_project(c: &mut Criterion) {
    let dir = create_test_project();
    let mut manager = ParserManager::new();
    
    // Collect all files
    let files: Vec<_> = walkdir::WalkDir::new(dir.path())
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "ts"))
        .map(|e| e.path().to_path_buf())
        .collect();
    
    c.bench_function("parse_project_files", |b| {
        b.iter(|| {
            for file in &files {
                let source = fs::read_to_string(file).unwrap();
                manager.parse_file(&file.to_string_lossy(), &source);
            }
        })
    });
}

fn bench_boundary_scan(c: &mut Criterion) {
    let dir = create_test_project();
    
    let files: Vec<_> = walkdir::WalkDir::new(dir.path())
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "ts"))
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    
    c.bench_function("boundary_scan", |b| {
        b.iter(|| {
            let mut scanner = BoundaryScanner::new();
            scanner.scan_files(&files)
        })
    });
}

fn bench_coupling_analysis(c: &mut Criterion) {
    let dir = create_test_project();
    
    let files: Vec<_> = walkdir::WalkDir::new(dir.path())
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "ts"))
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    
    c.bench_function("coupling_analysis", |b| {
        b.iter(|| {
            let mut analyzer = CouplingAnalyzer::new();
            analyzer.analyze(&files)
        })
    });
}

fn bench_test_topology(c: &mut Criterion) {
    let dir = create_test_project();
    
    let files: Vec<_> = walkdir::WalkDir::new(dir.path())
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "ts"))
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    
    c.bench_function("test_topology", |b| {
        b.iter(|| {
            let mut analyzer = TestTopologyAnalyzer::new();
            analyzer.analyze(&files)
        })
    });
}

fn bench_error_handling(c: &mut Criterion) {
    let dir = create_test_project();
    
    let files: Vec<_> = walkdir::WalkDir::new(dir.path())
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "ts"))
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    
    c.bench_function("error_handling", |b| {
        b.iter(|| {
            let mut analyzer = ErrorHandlingAnalyzer::new();
            analyzer.analyze(&files)
        })
    });
}

criterion_group!(
    benches,
    bench_scanner,
    bench_parse_project,
    bench_boundary_scan,
    bench_coupling_analysis,
    bench_test_topology,
    bench_error_handling,
);

criterion_main!(benches);
