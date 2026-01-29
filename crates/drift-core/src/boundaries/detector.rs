//! Data access detector - Detects database access patterns in source code
//!
//! AST-first approach: Uses tree-sitter parsed CallSite data to detect
//! database access patterns. Regex is only used as fallback for SQL strings
//! embedded in code that can't be captured via AST.

use regex::Regex;
use super::types::*;
use crate::parsers::{ParseResult, CallSite};

/// Data access detector - AST-first with regex fallbacks for SQL strings
pub struct DataAccessDetector {
    // Regex fallbacks for SQL strings (AST can't parse SQL inside strings)
    sql_select: Regex,
    sql_insert: Regex,
    sql_update: Regex,
    sql_delete: Regex,
}

impl DataAccessDetector {
    pub fn new() -> Self {
        Self {
            // SQL regex - only used for raw SQL strings that AST can't parse
            sql_select: Regex::new(r"(?i)SELECT\s+.+\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)").unwrap(),
            sql_insert: Regex::new(r"(?i)INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)").unwrap(),
            sql_update: Regex::new(r"(?i)UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)").unwrap(),
            sql_delete: Regex::new(r"(?i)DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)").unwrap(),
        }
    }
    
    /// Detect data access from AST-parsed call sites (primary method)
    pub fn detect_from_ast(&self, result: &ParseResult, file: &str) -> Vec<DataAccessPoint> {
        let mut access_points = Vec::new();
        
        for call in &result.calls {
            if let Some(access) = self.detect_from_call_site(call, file) {
                access_points.push(access);
            }
        }
        
        access_points
    }
    
    /// Detect data access from a single AST call site
    fn detect_from_call_site(&self, call: &CallSite, file: &str) -> Option<DataAccessPoint> {
        let receiver = call.receiver.as_deref();
        let callee = call.callee.as_str();
        
        // Supabase: supabase.from('table')
        if callee == "from" && receiver.map_or(false, |r| r.contains("supabase")) {
            return Some(DataAccessPoint {
                table: "unknown".to_string(), // Table name is in string arg, need source
                operation: DataOperation::Read,
                fields: Vec::new(),
                file: file.to_string(),
                line: call.range.start.line,
                confidence: 0.9,
                framework: Some("supabase".to_string()),
            });
        }
        
        // Prisma: prisma.user.findMany(), this.prisma.user.findMany(), prisma.post.create()
        if let Some(recv) = receiver {
            // Handle both "prisma.user" and "this.prisma.user" patterns
            let prisma_table = if recv.starts_with("this.prisma.") {
                Some(recv.strip_prefix("this.prisma.").unwrap_or("unknown"))
            } else if recv.starts_with("prisma.") {
                Some(recv.strip_prefix("prisma.").unwrap_or("unknown"))
            } else if recv.contains(".prisma.") {
                // Handle other patterns like "self.prisma.user"
                recv.split(".prisma.").nth(1)
            } else {
                None
            };
            
            if let Some(table) = prisma_table {
                let operation = match callee {
                    "create" | "createMany" | "update" | "updateMany" | "upsert" => DataOperation::Write,
                    "delete" | "deleteMany" => DataOperation::Delete,
                    _ => DataOperation::Read,
                };
                return Some(DataAccessPoint {
                    table: table.to_string(),
                    operation,
                    fields: Vec::new(),
                    file: file.to_string(),
                    line: call.range.start.line,
                    confidence: 0.95,
                    framework: Some("prisma".to_string()),
                });
            }
        }
        
        // TypeORM: getRepository(Entity)
        if callee == "getRepository" {
            return Some(DataAccessPoint {
                table: "unknown".to_string(),
                operation: DataOperation::Read,
                fields: Vec::new(),
                file: file.to_string(),
                line: call.range.start.line,
                confidence: 0.9,
                framework: Some("typeorm".to_string()),
            });
        }
        
        // Sequelize: Model.findAll(), Model.create()
        if let Some(recv) = receiver {
            if recv.chars().next().map_or(false, |c| c.is_uppercase()) {
                let is_sequelize = matches!(callee, 
                    "findAll" | "findOne" | "findByPk" | "create" | "update" | "destroy" | "bulkCreate"
                );
                if is_sequelize {
                    let operation = match callee {
                        "create" | "update" | "bulkCreate" => DataOperation::Write,
                        "destroy" => DataOperation::Delete,
                        _ => DataOperation::Read,
                    };
                    return Some(DataAccessPoint {
                        table: recv.to_lowercase(),
                        operation,
                        fields: Vec::new(),
                        file: file.to_string(),
                        line: call.range.start.line,
                        confidence: 0.85,
                        framework: Some("sequelize".to_string()),
                    });
                }
            }
        }
        
        // Django: Model.objects.filter(), Model.objects.create()
        if let Some(recv) = receiver {
            if recv.ends_with(".objects") {
                let model = recv.strip_suffix(".objects").unwrap_or("unknown");
                let operation = match callee {
                    "create" | "update" | "bulk_create" | "bulk_update" => DataOperation::Write,
                    "delete" => DataOperation::Delete,
                    _ => DataOperation::Read,
                };
                return Some(DataAccessPoint {
                    table: format!("{}s", model.to_lowercase()),
                    operation,
                    fields: Vec::new(),
                    file: file.to_string(),
                    line: call.range.start.line,
                    confidence: 0.9,
                    framework: Some("django".to_string()),
                });
            }
        }
        
        // GORM (Go): db.Find(), db.Create()
        if receiver == Some("db") {
            let is_gorm = matches!(callee, 
                "Find" | "First" | "Last" | "Take" | "Create" | "Save" | "Update" | "Delete"
            );
            if is_gorm {
                let operation = match callee {
                    "Create" | "Save" | "Update" => DataOperation::Write,
                    "Delete" => DataOperation::Delete,
                    _ => DataOperation::Read,
                };
                return Some(DataAccessPoint {
                    table: "unknown".to_string(),
                    operation,
                    fields: Vec::new(),
                    file: file.to_string(),
                    line: call.range.start.line,
                    confidence: 0.85,
                    framework: Some("gorm".to_string()),
                });
            }
        }
        
        // Diesel (Rust): users::table.filter()
        if let Some(recv) = receiver {
            if recv.ends_with("::table") {
                let table = recv.strip_suffix("::table").unwrap_or("unknown");
                return Some(DataAccessPoint {
                    table: table.to_string(),
                    operation: DataOperation::Read,
                    fields: Vec::new(),
                    file: file.to_string(),
                    line: call.range.start.line,
                    confidence: 0.9,
                    framework: Some("diesel".to_string()),
                });
            }
        }
        
        None
    }
    
    /// Regex fallback: Detect SQL in raw source (for embedded SQL strings)
    pub fn detect_sql_in_source(&self, source: &str, file: &str) -> Vec<DataAccessPoint> {
        let mut access_points = Vec::new();
        let lines: Vec<&str> = source.lines().collect();
        
        for (i, line) in lines.iter().enumerate() {
            let line_num = (i + 1) as u32;
            
            // Only check lines that look like they contain SQL strings
            if !line.contains("SELECT") && !line.contains("INSERT") && 
               !line.contains("UPDATE") && !line.contains("DELETE") &&
               !line.contains("select") && !line.contains("insert") &&
               !line.contains("update") && !line.contains("delete") {
                continue;
            }
            
            if let Some(caps) = self.sql_select.captures(line) {
                if let Some(table) = caps.get(1) {
                    access_points.push(DataAccessPoint {
                        table: table.as_str().to_string(),
                        operation: DataOperation::Read,
                        fields: Vec::new(),
                        file: file.to_string(),
                        line: line_num,
                        confidence: 0.85,
                        framework: Some("sql".to_string()),
                    });
                }
            }
            
            if let Some(caps) = self.sql_insert.captures(line) {
                if let Some(table) = caps.get(1) {
                    access_points.push(DataAccessPoint {
                        table: table.as_str().to_string(),
                        operation: DataOperation::Write,
                        fields: Vec::new(),
                        file: file.to_string(),
                        line: line_num,
                        confidence: 0.85,
                        framework: Some("sql".to_string()),
                    });
                }
            }
            
            if let Some(caps) = self.sql_update.captures(line) {
                if let Some(table) = caps.get(1) {
                    access_points.push(DataAccessPoint {
                        table: table.as_str().to_string(),
                        operation: DataOperation::Write,
                        fields: Vec::new(),
                        file: file.to_string(),
                        line: line_num,
                        confidence: 0.85,
                        framework: Some("sql".to_string()),
                    });
                }
            }
            
            if let Some(caps) = self.sql_delete.captures(line) {
                if let Some(table) = caps.get(1) {
                    access_points.push(DataAccessPoint {
                        table: table.as_str().to_string(),
                        operation: DataOperation::Delete,
                        fields: Vec::new(),
                        file: file.to_string(),
                        line: line_num,
                        confidence: 0.85,
                        framework: Some("sql".to_string()),
                    });
                }
            }
        }
        
        access_points
    }
    
    /// Combined detection: AST-first, then SQL regex fallback
    pub fn detect(&self, source: &str, file: &str) -> Vec<DataAccessPoint> {
        // For backward compatibility - this method uses regex only
        // Prefer detect_from_ast() when you have ParseResult
        self.detect_sql_in_source(source, file)
    }
}

impl Default for DataAccessDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detect_sql() {
        let detector = DataAccessDetector::new();
        let source = r#"
            SELECT id, name FROM users WHERE active = true;
            INSERT INTO orders (user_id, total) VALUES (1, 100);
        "#;
        
        let access = detector.detect_sql_in_source(source, "test.sql");
        assert_eq!(access.len(), 2);
        assert_eq!(access[0].table, "users");
        assert_eq!(access[0].operation, DataOperation::Read);
        assert_eq!(access[1].table, "orders");
        assert_eq!(access[1].operation, DataOperation::Write);
    }
}
