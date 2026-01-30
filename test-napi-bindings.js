#!/usr/bin/env node
/**
 * Test NAPI bindings for all languages to verify enterprise features are exposed
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const native = require('./crates/drift-napi/index.js');

const testCases = {
  typescript: {
    ext: 'test.ts',
    source: `
/** User service for managing users */
export class UserService {
  private id: number;
  public name: string;
  
  /** Create a new user */
  async createUser(name: string, email: string, age: number = 25): Promise<User> {
    return new User();
  }
}
`
  },
  
  python: {
    ext: 'test.py',
    source: `
class UserService:
    """User service for managing users"""
    id: int
    name: str
    
    async def create_user(self, name: str, email: str, age: int = 25) -> User:
        """Create a new user"""
        return User()
`
  },
  
  go: {
    ext: 'test.go',
    source: `
package main

// User represents a system user
type User struct {
    ID    int    \`json:"id" gorm:"primaryKey"\`
    Name  string \`json:"name"\`
    Email string \`json:"email" validate:"required"\`
}

// CreateUser creates a new user in the database
func CreateUser(name string, email string, age int) (*User, error) {
    return nil, nil
}
`
  },
  
  java: {
    ext: 'Test.java',
    source: `
public class UserService {
    private int id;
    public String name;
    
    /**
     * Create a new user
     * @param name User name
     * @param email User email
     */
    public User createUser(String name, String email, int age) {
        return new User();
    }
}
`
  },
  
  csharp: {
    ext: 'Test.cs',
    source: `
public class UserService {
    private int id;
    public string Name { get; set; }
    
    /// <summary>Create a new user</summary>
    public async Task<User> CreateUser(string name, string email, int age = 25) {
        return new User();
    }
}
`
  },
  
  php: {
    ext: 'test.php',
    source: `<?php
class UserService {
    private int $id;
    public string $name;
    
    /**
     * Create a new user
     */
    public function createUser(string $name, string $email, int $age = 25): User {
        return new User();
    }
}
`
  },
  
  rust: {
    ext: 'test.rs',
    source: `
/// User service for managing users
pub struct UserService {
    id: i32,
    pub name: String,
}

impl UserService {
    /// Create a new user
    pub fn create_user(name: &str, email: &str, age: i32) -> Result<User, Error> {
        Ok(User::new())
    }
}
`
  },
  
  cpp: {
    ext: 'test.cpp',
    source: `
/**
 * User service for managing users
 */
class UserService {
private:
    int id;
public:
    std::string name;
    
    /**
     * Create a new user
     * @param name User name
     * @param email User email
     */
    int createUser(const std::string& name, const std::string& email, int age = 25) {
        return 0;
    }
};
`
  },
  
  c: {
    ext: 'test.c',
    source: `
/* User struct */
struct User {
    int id;
    char* name;
    char* email;
};

/**
 * Create a new user
 * @param name User name
 * @param email User email
 */
struct User* create_user(const char* name, const char* email, int age) {
    return NULL;
}
`
  }
};

console.log('='.repeat(60));
console.log('NAPI BINDINGS TEST - All Languages');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const [lang, test] of Object.entries(testCases)) {
  console.log(`\n--- ${lang.toUpperCase()} ---`);
  
  try {
    const result = native.parse(test.source, test.ext);
    
    if (!result) {
      console.log(`  ❌ FAILED: parse returned null`);
      failed++;
      continue;
    }
    
    // Check functions
    const func = result.functions.find(f => 
      f.name.toLowerCase().includes('create') || 
      f.name.toLowerCase().includes('user')
    );
    
    if (func) {
      console.log(`  Function: ${func.name}`);
      console.log(`    Parameters: ${func.parameters ? func.parameters.length : 'MISSING'}`);
      if (func.parameters && func.parameters.length > 0) {
        func.parameters.forEach(p => {
          console.log(`      - ${p.name}: ${p.typeAnnotation || 'no type'}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`);
        });
      }
      console.log(`    Return Type: ${func.returnType || 'MISSING'}`);
      console.log(`    Doc Comment: ${func.docComment ? 'YES' : 'MISSING'}`);
    } else {
      console.log(`  ⚠️  No function found`);
    }
    
    // Check classes/structs
    const cls = result.classes.find(c => 
      c.name.toLowerCase().includes('user') || 
      c.name.toLowerCase().includes('service')
    );
    
    if (cls) {
      console.log(`  Class: ${cls.name}`);
      console.log(`    Properties: ${cls.properties ? cls.properties.length : 'MISSING'}`);
      if (cls.properties && cls.properties.length > 0) {
        cls.properties.forEach(p => {
          console.log(`      - ${p.visibility || 'unknown'} ${p.name}: ${p.typeAnnotation || 'no type'}${p.tags ? ` [tags: ${p.tags.length}]` : ''}`);
        });
      }
    } else {
      console.log(`  ⚠️  No class/struct found`);
    }
    
    // Validation
    const hasParams = func && func.parameters && func.parameters.length > 0;
    const hasReturnType = func && func.returnType;
    const hasDocComment = func && func.docComment;
    const hasProperties = cls && cls.properties && cls.properties.length > 0;
    
    if (hasParams && hasProperties) {
      console.log(`  ✅ PASSED`);
      passed++;
    } else {
      console.log(`  ❌ FAILED: Missing ${!hasParams ? 'parameters ' : ''}${!hasProperties ? 'properties' : ''}`);
      failed++;
    }
    
  } catch (err) {
    console.log(`  ❌ ERROR: ${err.message}`);
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
