//! Parsing benchmarks
//!
//! Run with: cargo bench --package drift-core

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use drift_core::parsers::ParserManager;

const TYPESCRIPT_SAMPLE: &str = r#"
import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { validateInput } from '../utils/validation';

export interface CreateUserDTO {
  email: string;
  password: string;
  name?: string;
}

export class UserController {
  constructor(private userService: UserService) {}

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const dto: CreateUserDTO = validateInput(req.body);
      const user = await this.userService.create(dto);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = await this.userService.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const updates = req.body;
    const user = await this.userService.update(id, updates);
    res.json(user);
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    await this.userService.delete(id);
    res.status(204).send();
  }
}
"#;

const PYTHON_SAMPLE: &str = r#"
from typing import Optional, List
from dataclasses import dataclass
from sqlalchemy.orm import Session
from .models import User
from .schemas import UserCreate, UserUpdate

@dataclass
class UserService:
    db: Session

    def get_user(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def get_users(self, skip: int = 0, limit: int = 100) -> List[User]:
        return self.db.query(User).offset(skip).limit(limit).all()

    def create_user(self, user: UserCreate) -> User:
        db_user = User(
            email=user.email,
            hashed_password=self._hash_password(user.password),
            name=user.name
        )
        self.db.add(db_user)
        self.db.commit()
        self.db.refresh(db_user)
        return db_user

    def update_user(self, user_id: int, user: UserUpdate) -> Optional[User]:
        db_user = self.get_user(user_id)
        if not db_user:
            return None
        for key, value in user.dict(exclude_unset=True).items():
            setattr(db_user, key, value)
        self.db.commit()
        return db_user

    def delete_user(self, user_id: int) -> bool:
        db_user = self.get_user(user_id)
        if not db_user:
            return False
        self.db.delete(db_user)
        self.db.commit()
        return True

    def _hash_password(self, password: str) -> str:
        import hashlib
        return hashlib.sha256(password.encode()).hexdigest()
"#;

fn bench_parse_typescript(c: &mut Criterion) {
    let mut manager = ParserManager::new();
    
    c.bench_function("parse_typescript_controller", |b| {
        b.iter(|| {
            manager.parse_file(
                black_box("user.controller.ts"),
                black_box(TYPESCRIPT_SAMPLE),
            )
        })
    });
}

fn bench_parse_python(c: &mut Criterion) {
    let mut manager = ParserManager::new();
    
    c.bench_function("parse_python_service", |b| {
        b.iter(|| {
            manager.parse_file(
                black_box("user_service.py"),
                black_box(PYTHON_SAMPLE),
            )
        })
    });
}

fn bench_parse_multiple_languages(c: &mut Criterion) {
    let mut manager = ParserManager::new();
    
    let samples = vec![
        ("typescript", "test.ts", TYPESCRIPT_SAMPLE),
        ("python", "test.py", PYTHON_SAMPLE),
    ];
    
    let mut group = c.benchmark_group("parse_languages");
    
    for (lang, file, source) in samples {
        group.bench_with_input(
            BenchmarkId::new("parse", lang),
            &(file, source),
            |b, (file, source)| {
                b.iter(|| manager.parse_file(black_box(file), black_box(source)))
            },
        );
    }
    
    group.finish();
}

criterion_group!(
    benches,
    bench_parse_typescript,
    bench_parse_python,
    bench_parse_multiple_languages,
);

criterion_main!(benches);
