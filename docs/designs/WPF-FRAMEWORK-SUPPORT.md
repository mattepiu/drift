# WPF Framework Support Design

## Overview

Add comprehensive support for Windows Presentation Foundation (WPF) desktop applications, enabling full call graph analysis, data flow mapping, and pattern detection across the XAML UI layer and C# code-behind/ViewModels.

## Motivation

WPF remains a primary framework for C# desktop development. Current Drift C# support focuses on ASP.NET Core web applications, missing the critical XAML↔C# binding connections that define WPF architecture. This gap prevents users from:

- Mapping UI element bindings to ViewModel properties
- Tracing data flow from UI through ViewModels to Entity Framework
- Detecting MVVM pattern violations
- Understanding command routing and event handling

## Goals

1. Parse XAML files and extract binding/command information
2. Link XAML elements to C# ViewModels and code-behind
3. Integrate WPF-specific nodes into the existing call graph
4. Detect WPF-specific patterns and anti-patterns
5. Support both CLI and MCP interfaces

## Non-Goals

- WinForms support (separate initiative)
- UWP/WinUI support (separate initiative)
- XAML designer integration
- Runtime binding analysis

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        WPF Support Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ XAML Parser │  │  Binding    │  │  ViewModel/CodeBehind   │  │
│  │             │──│  Extractor  │──│  Linker                 │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                      │                │
│         ▼                ▼                      ▼                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              WPF Call Graph Integrator                       ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           Existing C# Call Graph + Entity Framework          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
packages/core/src/
├── wpf/
│   ├── index.ts
│   ├── types.ts
│   ├── parsers/
│   │   ├── xaml-parser.ts
│   │   ├── xaml-binding-extractor.ts
│   │   └── resource-dictionary-parser.ts
│   ├── linkers/
│   │   ├── viewmodel-linker.ts
│   │   ├── code-behind-linker.ts
│   │   └── datacontext-resolver.ts
│   ├── extractors/
│   │   ├── command-extractor.ts
│   │   ├── dependency-property-extractor.ts
│   │   ├── value-converter-extractor.ts
│   │   └── behavior-extractor.ts
│   ├── patterns/
│   │   ├── mvvm-detector.ts
│   │   ├── binding-error-detector.ts
│   │   └── code-behind-antipattern-detector.ts
│   └── integration/
│       ├── wpf-callgraph-adapter.ts
│       └── wpf-project-detector.ts

packages/cli/src/commands/
├── wpf.ts                    # drift wpf <subcommand>

packages/mcp/src/tools/
├── analysis/
│   └── wpf.ts                # drift_wpf MCP tool
```

---

## Phase 1: XAML Parsing

### 1.1 XAML Parser

Parse XAML files as XML, extracting structural information.

```typescript
// packages/core/src/wpf/types.ts

export interface XamlElement {
  name: string;                    // e.g., "Button", "TextBox"
  namespace: string;               // e.g., "http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  attributes: Map<string, string>;
  bindings: XamlBinding[];
  commands: XamlCommand[];
  children: XamlElement[];
  location: {
    file: string;
    line: number;
    column: number;
  };
}

export interface XamlBinding {
  property: string;              // e.g., "Text", "ItemsSource"
  path: string;                  // e.g., "UserName", "Items[0].Name"
  mode: 'OneWay' | 'TwoWay' | 'OneTime' | 'OneWayToSource' | 'Default';
  converter?: string;            // e.g., "BoolToVisibilityConverter"
  converterParameter?: string;
  source?: string;               // StaticResource, RelativeSource, ElementName
  fallbackValue?: string;
  targetNullValue?: string;
  updateSourceTrigger?: 'PropertyChanged' | 'LostFocus' | 'Explicit' | 'Default';
}

export interface XamlCommand {
  property: string;              // e.g., "Command"
  binding: string;               // e.g., "SaveCommand"
  commandParameter?: string;
}

export interface XamlFile {
  path: string;
  rootElement: XamlElement;
  xClass: string | null;         // x:Class attribute - links to code-behind
  dataContextType: string | null; // d:DataContext or DataContext binding
  resources: XamlResource[];
  namespaces: Map<string, string>;
}
```

### 1.2 Binding Extractor

Extract all binding expressions from XAML.

```typescript
// packages/core/src/wpf/parsers/xaml-binding-extractor.ts

export interface BindingExtractionResult {
  bindings: ExtractedBinding[];
  commands: ExtractedCommand[];
  resources: ExtractedResource[];
  errors: BindingParseError[];
}

export interface ExtractedBinding {
  elementName: string;
  elementType: string;
  property: string;
  bindingExpression: string;
  parsed: XamlBinding;
  location: SourceLocation;
}

// Regex patterns for binding extraction
const BINDING_PATTERNS = {
  // {Binding Path=Name, Mode=TwoWay}
  standard: /\{Binding\s+(?:Path=)?([^,}]+)(?:,\s*([^}]+))?\}/,
  
  // {x:Bind ViewModel.Name, Mode=OneWay}
  xBind: /\{x:Bind\s+([^,}]+)(?:,\s*([^}]+))?\}/,
  
  // {StaticResource ResourceKey}
  staticResource: /\{StaticResource\s+([^}]+)\}/,
  
  // {DynamicResource ResourceKey}
  dynamicResource: /\{DynamicResource\s+([^}]+)\}/,
  
  // {RelativeSource Self}
  relativeSource: /\{RelativeSource\s+([^}]+)\}/,
  
  // {TemplateBinding Property}
  templateBinding: /\{TemplateBinding\s+([^}]+)\}/,
};
```

### 1.3 Resource Dictionary Parser

Parse merged resource dictionaries and resolve resource references.

```typescript
// packages/core/src/wpf/parsers/resource-dictionary-parser.ts

export interface ResourceDictionary {
  path: string;
  mergedDictionaries: string[];  // Paths to merged dictionaries
  resources: Map<string, XamlResource>;
}

export interface XamlResource {
  key: string;
  type: 'Style' | 'DataTemplate' | 'ControlTemplate' | 'Converter' | 'Brush' | 'Other';
  targetType?: string;           // For styles/templates
  converterType?: string;        // For converters - the C# class
  location: SourceLocation;
}
```

---

## Phase 2: C# Integration

### 2.1 ViewModel Linker

Link XAML bindings to ViewModel properties.

```typescript
// packages/core/src/wpf/linkers/viewmodel-linker.ts

export interface ViewModelLink {
  xamlFile: string;
  xamlElement: string;
  bindingPath: string;
  viewModelClass: string;
  viewModelProperty: string;
  propertyType: string;
  notifiesChange: boolean;       // Implements INotifyPropertyChanged
  location: {
    xaml: SourceLocation;
    csharp: SourceLocation;
  };
}

export interface ViewModelAnalysis {
  className: string;
  filePath: string;
  properties: ViewModelProperty[];
  commands: ViewModelCommand[];
  implementsINPC: boolean;       // INotifyPropertyChanged
  baseClass?: string;
}

export interface ViewModelProperty {
  name: string;
  type: string;
  hasGetter: boolean;
  hasSetter: boolean;
  raisesPropertyChanged: boolean;
  backingField?: string;
  location: SourceLocation;
}

export interface ViewModelCommand {
  name: string;
  commandType: string;           // RelayCommand, DelegateCommand, etc.
  executeMethod?: string;
  canExecuteMethod?: string;
  location: SourceLocation;
}
```

### 2.2 DataContext Resolver

Resolve DataContext inheritance chain.

```typescript
// packages/core/src/wpf/linkers/datacontext-resolver.ts

export interface DataContextResolution {
  xamlFile: string;
  element: string;
  resolvedType: string | null;
  resolutionPath: DataContextStep[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DataContextStep {
  source: 'explicit' | 'inherited' | 'design-time' | 'code-behind';
  element?: string;
  type: string;
  location?: SourceLocation;
}

// Resolution strategies:
// 1. Explicit: DataContext="{Binding}" or DataContext="{StaticResource vm}"
// 2. Design-time: d:DataContext="{d:DesignInstance Type=ViewModels.MainViewModel}"
// 3. Code-behind: this.DataContext = new MainViewModel();
// 4. Inherited: Walk up element tree
```

### 2.3 Code-Behind Linker

Link XAML x:Class to .xaml.cs files.

```typescript
// packages/core/src/wpf/linkers/code-behind-linker.ts

export interface CodeBehindLink {
  xamlFile: string;
  codeBehindFile: string;
  className: string;
  namespace: string;
  eventHandlers: EventHandlerLink[];
  namedElements: NamedElementLink[];
}

export interface EventHandlerLink {
  xamlElement: string;
  eventName: string;             // e.g., "Click", "Loaded"
  handlerName: string;           // e.g., "Button_Click"
  handlerLocation: SourceLocation;
}

export interface NamedElementLink {
  xamlName: string;              // x:Name="myButton"
  elementType: string;           // Button
  codeBehindUsages: SourceLocation[];
}
```


---

## Phase 3: Hybrid Extraction (AST + Regex Fallback)

Following Drift's established pattern, WPF extraction uses a hybrid approach:
1. **Primary**: Tree-sitter AST parsing for C# code, XML DOM for XAML
2. **Fallback**: Regex patterns when AST parsing fails or is unavailable

### 3.1 XAML Hybrid Extractor

```typescript
// packages/core/src/wpf/extractors/xaml-hybrid-extractor.ts

import { HybridExtractorBase } from '../../call-graph/extractors/hybrid-extractor-base';

export class XamlHybridExtractor extends HybridExtractorBase {
  
  async extract(filePath: string, content: string): Promise<XamlExtractionResult> {
    // Try AST-based extraction first (XML DOM parsing)
    try {
      const astResult = await this.extractWithAst(content);
      if (astResult.confidence >= 0.8) {
        return astResult;
      }
      // Supplement with regex if AST confidence is low
      const regexResult = await this.extractWithRegex(content);
      return this.mergeResults(astResult, regexResult);
    } catch (astError) {
      // Fall back to regex-only extraction
      console.warn(`AST extraction failed for ${filePath}, using regex fallback`);
      return this.extractWithRegex(content);
    }
  }

  private async extractWithAst(content: string): Promise<XamlExtractionResult> {
    // Use fast-xml-parser or similar for DOM parsing
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: true,
    });
    
    const doc = parser.parse(content);
    return this.walkXamlTree(doc);
  }

  private async extractWithRegex(content: string): Promise<XamlExtractionResult> {
    const regexExtractor = new XamlRegexExtractor();
    return regexExtractor.extract(content);
  }
}
```

### 3.2 XAML Regex Fallback Patterns

```typescript
// packages/core/src/wpf/extractors/regex/xaml-regex.ts

export const XAML_REGEX_PATTERNS = {
  // x:Class declaration
  xClass: /x:Class\s*=\s*["']([^"']+)["']/,
  
  // Standard bindings: {Binding Path=Name} or {Binding Name}
  binding: /\{Binding\s+(?:Path\s*=\s*)?["']?([^,}"'\s]+)["']?(?:[^}]*)?\}/g,
  
  // x:Bind expressions (compiled bindings)
  xBind: /\{x:Bind\s+([^,}]+)(?:,\s*Mode\s*=\s*(\w+))?[^}]*\}/g,
  
  // Command bindings
  command: /Command\s*=\s*["']\{Binding\s+([^}]+)\}["']/g,
  
  // DataContext assignments
  dataContext: /DataContext\s*=\s*["']\{([^}]+)\}["']/g,
  
  // Design-time DataContext
  designDataContext: /d:DataContext\s*=\s*["']\{d:DesignInstance\s+(?:Type\s*=\s*)?([^,}"']+)/g,
  
  // StaticResource references
  staticResource: /\{StaticResource\s+([^}]+)\}/g,
  
  // DynamicResource references
  dynamicResource: /\{DynamicResource\s+([^}]+)\}/g,
  
  // x:Name declarations
  xName: /x:Name\s*=\s*["']([^"']+)["']/g,
  
  // Event handlers in XAML
  eventHandler: /(\w+)\s*=\s*["']([A-Z]\w+_\w+)["']/g,
  
  // Converter references
  converter: /Converter\s*=\s*\{StaticResource\s+([^}]+)\}/g,
  
  // ItemsSource bindings (common for lists)
  itemsSource: /ItemsSource\s*=\s*["']\{Binding\s+([^}]+)\}["']/g,
  
  // SelectedItem bindings
  selectedItem: /SelectedItem\s*=\s*["']\{Binding\s+([^}]+)\}["']/g,
};

export class XamlRegexExtractor {
  extract(content: string): XamlExtractionResult {
    const bindings: ExtractedBinding[] = [];
    const commands: ExtractedCommand[] = [];
    const resources: ExtractedResource[] = [];
    
    // Extract x:Class
    const xClassMatch = content.match(XAML_REGEX_PATTERNS.xClass);
    const xClass = xClassMatch ? xClassMatch[1] : null;
    
    // Extract all bindings
    let match;
    while ((match = XAML_REGEX_PATTERNS.binding.exec(content)) !== null) {
      bindings.push({
        path: match[1],
        raw: match[0],
        line: this.getLineNumber(content, match.index),
      });
    }
    
    // Extract commands
    while ((match = XAML_REGEX_PATTERNS.command.exec(content)) !== null) {
      commands.push({
        binding: match[1],
        raw: match[0],
        line: this.getLineNumber(content, match.index),
      });
    }
    
    return { xClass, bindings, commands, resources, confidence: 0.6 };
  }
}
```

### 3.3 C# ViewModel Hybrid Extractor

Extends existing C# Tree-sitter extractor with WPF-specific patterns.

```typescript
// packages/core/src/wpf/extractors/viewmodel-hybrid-extractor.ts

import { CSharpHybridExtractor } from '../../call-graph/extractors/csharp-hybrid-extractor';

export class ViewModelHybridExtractor extends CSharpHybridExtractor {
  
  async extractViewModelInfo(filePath: string, content: string): Promise<ViewModelAnalysis> {
    // Use parent's AST extraction
    const astResult = await this.extractWithTreeSitter(content);
    
    if (astResult) {
      return this.analyzeViewModelFromAst(astResult);
    }
    
    // Regex fallback for ViewModel patterns
    return this.extractViewModelWithRegex(content);
  }

  private analyzeViewModelFromAst(ast: any): ViewModelAnalysis {
    // Walk AST to find:
    // - INotifyPropertyChanged implementation
    // - Properties with OnPropertyChanged calls
    // - ICommand properties
    // - RelayCommand/DelegateCommand instantiations
    return {
      className: this.findClassName(ast),
      implementsINPC: this.checkINPCImplementation(ast),
      properties: this.extractProperties(ast),
      commands: this.extractCommands(ast),
    };
  }
}
```

### 3.4 C# ViewModel Regex Patterns

```typescript
// packages/core/src/wpf/extractors/regex/viewmodel-regex.ts

export const VIEWMODEL_REGEX_PATTERNS = {
  // INotifyPropertyChanged implementation
  inpcImplementation: /:\s*(?:[\w.]+,\s*)*INotifyPropertyChanged/,
  
  // Property with backing field pattern
  propertyWithBacking: /private\s+(\w+(?:<[^>]+>)?)\s+_(\w+);\s*public\s+\1\s+(\w+)\s*\{/g,
  
  // OnPropertyChanged/RaisePropertyChanged calls
  propertyChanged: /(?:OnPropertyChanged|RaisePropertyChanged|NotifyPropertyChanged)\s*\(\s*(?:nameof\s*\(\s*(\w+)\s*\)|["'](\w+)["'])/g,
  
  // SetProperty pattern (MVVM Toolkit style)
  setProperty: /SetProperty\s*\(\s*ref\s+_?(\w+)\s*,\s*value\s*(?:,\s*nameof\s*\(\s*(\w+)\s*\))?\)/g,
  
  // ICommand property declarations
  commandProperty: /public\s+(?:ICommand|RelayCommand|DelegateCommand|AsyncRelayCommand)(?:<[^>]+>)?\s+(\w+Command)\s*\{/g,
  
  // RelayCommand instantiation
  relayCommandInit: /(\w+Command)\s*=\s*new\s+(?:Relay|Delegate|Async)?Command(?:<[^>]+>)?\s*\(\s*(\w+)(?:\s*,\s*(\w+))?\s*\)/g,
  
  // ObservableCollection declarations
  observableCollection: /(?:public|private)\s+ObservableCollection<(\w+)>\s+(\w+)/g,
  
  // BindableBase / ViewModelBase inheritance
  viewModelBase: /class\s+(\w+)\s*:\s*(?:ViewModelBase|BindableBase|ObservableObject|BaseViewModel)/,
  
  // [ObservableProperty] attribute (MVVM Toolkit source generators)
  observablePropertyAttr: /\[ObservableProperty\]\s*(?:\[[\w\(\)]+\]\s*)*private\s+(\w+(?:<[^>]+>)?)\s+_?(\w+)/g,
  
  // [RelayCommand] attribute
  relayCommandAttr: /\[RelayCommand(?:\([^\)]*\))?\]\s*(?:private|public)?\s*(?:async\s+)?(?:Task|void)\s+(\w+)\s*\(/g,
};

export class ViewModelRegexExtractor {
  extract(content: string): ViewModelAnalysis {
    const properties: ViewModelProperty[] = [];
    const commands: ViewModelCommand[] = [];
    
    // Check for INPC implementation
    const implementsINPC = VIEWMODEL_REGEX_PATTERNS.inpcImplementation.test(content);
    
    // Extract properties with property changed notifications
    let match;
    while ((match = VIEWMODEL_REGEX_PATTERNS.propertyWithBacking.exec(content)) !== null) {
      properties.push({
        name: match[3],
        type: match[1],
        backingField: `_${match[2]}`,
        raisesPropertyChanged: this.checkPropertyRaisesChanged(content, match[3]),
      });
    }
    
    // Extract commands
    while ((match = VIEWMODEL_REGEX_PATTERNS.commandProperty.exec(content)) !== null) {
      commands.push({
        name: match[1],
        commandType: this.inferCommandType(content, match[1]),
      });
    }
    
    // Extract MVVM Toolkit source-generated properties
    while ((match = VIEWMODEL_REGEX_PATTERNS.observablePropertyAttr.exec(content)) !== null) {
      properties.push({
        name: this.toPascalCase(match[2]),
        type: match[1],
        backingField: match[2],
        raisesPropertyChanged: true, // Source generator handles this
        isSourceGenerated: true,
      });
    }
    
    return { implementsINPC, properties, commands, confidence: 0.6 };
  }
}
```

### 3.5 Dependency Property Extractor

```typescript
// packages/core/src/wpf/extractors/dependency-property-extractor.ts

export const DEPENDENCY_PROPERTY_PATTERNS = {
  // Standard DependencyProperty.Register
  register: /public\s+static\s+(?:readonly\s+)?DependencyProperty\s+(\w+)Property\s*=\s*DependencyProperty\.Register\s*\(\s*(?:nameof\s*\(\s*(\w+)\s*\)|["'](\w+)["'])\s*,\s*typeof\s*\(\s*(\w+)\s*\)/g,
  
  // Attached property registration
  registerAttached: /public\s+static\s+(?:readonly\s+)?DependencyProperty\s+(\w+)Property\s*=\s*DependencyProperty\.RegisterAttached\s*\(/g,
  
  // Property wrapper (CLR wrapper for DP)
  propertyWrapper: /public\s+(\w+)\s+(\w+)\s*\{\s*get\s*\{\s*return\s*\(?\s*\1\s*\)?\s*GetValue\s*\(\s*(\w+)Property\s*\)/g,
  
  // PropertyChangedCallback
  propertyChangedCallback: /new\s+PropertyMetadata\s*\([^,]*,\s*(?:new\s+PropertyChangedCallback\s*\(\s*)?(\w+)\s*\)?/g,
  
  // CoerceValueCallback
  coerceCallback: /CoerceValueCallback\s*\(\s*(\w+)\s*\)/g,
};

export class DependencyPropertyExtractor {
  extract(content: string): DependencyPropertyInfo[] {
    const properties: DependencyPropertyInfo[] = [];
    
    let match;
    while ((match = DEPENDENCY_PROPERTY_PATTERNS.register.exec(content)) !== null) {
      properties.push({
        name: match[2] || match[3],
        fieldName: `${match[1]}Property`,
        propertyType: match[4],
        isAttached: false,
        callbacks: this.findCallbacks(content, match[1]),
      });
    }
    
    return properties;
  }
}
```


---

## Phase 4: Call Graph Integration

### 4.1 WPF Call Graph Node Types

```typescript
// packages/core/src/wpf/types.ts (additions)

export type WpfNodeType = 
  | 'xaml-element'
  | 'xaml-binding'
  | 'xaml-command'
  | 'viewmodel-property'
  | 'viewmodel-command'
  | 'dependency-property'
  | 'value-converter'
  | 'code-behind-handler';

export interface WpfCallGraphNode {
  id: string;
  type: WpfNodeType;
  name: string;
  file: string;
  line: number;
  metadata: WpfNodeMetadata;
}

export interface WpfNodeMetadata {
  // For xaml-binding
  bindingPath?: string;
  bindingMode?: string;
  
  // For viewmodel-property
  propertyType?: string;
  notifiesChange?: boolean;
  
  // For viewmodel-command
  executeMethod?: string;
  canExecuteMethod?: string;
  
  // For dependency-property
  ownerType?: string;
  defaultValue?: string;
  callbacks?: string[];
}

export interface WpfCallGraphEdge {
  source: string;
  target: string;
  type: WpfEdgeType;
  confidence: number;
}

export type WpfEdgeType =
  | 'binds-to'           // XAML binding → ViewModel property
  | 'invokes-command'    // XAML command → ViewModel ICommand
  | 'converts-with'      // Binding → ValueConverter
  | 'handles-event'      // XAML event → Code-behind handler
  | 'inherits-context'   // Child element → Parent DataContext
  | 'accesses-data';     // ViewModel → Entity Framework
```

### 4.2 WPF Call Graph Adapter

```typescript
// packages/core/src/wpf/integration/wpf-callgraph-adapter.ts

import { CallGraphBuilder } from '../../call-graph/analysis/graph-builder';

export class WpfCallGraphAdapter {
  constructor(
    private graphBuilder: CallGraphBuilder,
    private xamlExtractor: XamlHybridExtractor,
    private viewModelExtractor: ViewModelHybridExtractor,
  ) {}

  async integrateWpfNodes(projectPath: string): Promise<void> {
    // 1. Find all XAML files
    const xamlFiles = await this.findXamlFiles(projectPath);
    
    // 2. Extract bindings and commands from each XAML
    for (const xamlFile of xamlFiles) {
      const xamlData = await this.xamlExtractor.extract(xamlFile.path, xamlFile.content);
      
      // 3. Resolve DataContext to find target ViewModel
      const viewModelClass = await this.resolveDataContext(xamlData, projectPath);
      
      // 4. Link bindings to ViewModel properties
      if (viewModelClass) {
        await this.linkBindingsToViewModel(xamlData, viewModelClass);
      }
      
      // 5. Link code-behind event handlers
      await this.linkCodeBehindHandlers(xamlData);
    }
    
    // 6. Connect ViewModel methods to Entity Framework calls
    await this.connectToDataLayer();
  }

  private async linkBindingsToViewModel(
    xamlData: XamlExtractionResult,
    viewModel: ViewModelAnalysis
  ): Promise<void> {
    for (const binding of xamlData.bindings) {
      const property = viewModel.properties.find(p => p.name === binding.path);
      
      if (property) {
        // Create edge: XAML element → ViewModel property
        this.graphBuilder.addEdge({
          source: `xaml:${xamlData.xClass}:${binding.elementName}`,
          target: `csharp:${viewModel.className}:${property.name}`,
          type: 'binds-to',
          confidence: 0.9,
        });
      }
    }
    
    for (const command of xamlData.commands) {
      const vmCommand = viewModel.commands.find(c => c.name === command.binding);
      
      if (vmCommand) {
        // Create edge: XAML command → ViewModel ICommand
        this.graphBuilder.addEdge({
          source: `xaml:${xamlData.xClass}:${command.elementName}`,
          target: `csharp:${viewModel.className}:${vmCommand.name}`,
          type: 'invokes-command',
          confidence: 0.9,
        });
        
        // Also link to execute method if known
        if (vmCommand.executeMethod) {
          this.graphBuilder.addEdge({
            source: `csharp:${viewModel.className}:${vmCommand.name}`,
            target: `csharp:${viewModel.className}:${vmCommand.executeMethod}`,
            type: 'invokes',
            confidence: 0.95,
          });
        }
      }
    }
  }
}
```

---

## Phase 5: Pattern Detection

### 5.1 MVVM Compliance Detector

```typescript
// packages/core/src/wpf/patterns/mvvm-detector.ts

export interface MvvmComplianceResult {
  score: number;                    // 0-100
  violations: MvvmViolation[];
  recommendations: string[];
}

export interface MvvmViolation {
  type: MvvmViolationType;
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
}

export type MvvmViolationType =
  | 'logic-in-code-behind'
  | 'direct-ui-manipulation'
  | 'missing-inpc'
  | 'tight-coupling'
  | 'missing-command'
  | 'event-handler-with-logic';

export class MvvmComplianceDetector {
  async analyze(projectPath: string): Promise<MvvmComplianceResult> {
    const violations: MvvmViolation[] = [];
    
    // Check code-behind files for logic
    const codeBehindFiles = await this.findCodeBehindFiles(projectPath);
    for (const file of codeBehindFiles) {
      violations.push(...this.checkCodeBehindForLogic(file));
    }
    
    // Check ViewModels implement INPC
    const viewModels = await this.findViewModels(projectPath);
    for (const vm of viewModels) {
      if (!vm.implementsINPC) {
        violations.push({
          type: 'missing-inpc',
          severity: 'warning',
          file: vm.filePath,
          line: vm.classLine,
          message: `ViewModel ${vm.className} does not implement INotifyPropertyChanged`,
        });
      }
    }
    
    // Check for event handlers that should be commands
    violations.push(...await this.checkEventHandlersForCommands(projectPath));
    
    const score = this.calculateScore(violations);
    return { score, violations, recommendations: this.generateRecommendations(violations) };
  }

  private checkCodeBehindForLogic(file: CodeBehindFile): MvvmViolation[] {
    const violations: MvvmViolation[] = [];
    
    // Patterns that indicate logic in code-behind (anti-pattern)
    const logicPatterns = [
      /\.SaveChanges\s*\(/,           // EF calls
      /HttpClient/,                    // HTTP calls
      /await\s+\w+Service\./,         // Service calls
      /if\s*\([^)]+\)\s*\{[^}]+\}/,   // Complex conditionals
      /for\s*\(|foreach\s*\(/,        // Loops
    ];
    
    for (const pattern of logicPatterns) {
      const matches = file.content.matchAll(new RegExp(pattern, 'g'));
      for (const match of matches) {
        violations.push({
          type: 'logic-in-code-behind',
          severity: 'warning',
          file: file.path,
          line: this.getLineNumber(file.content, match.index!),
          message: 'Business logic detected in code-behind. Consider moving to ViewModel.',
        });
      }
    }
    
    return violations;
  }
}
```

### 5.2 Binding Error Detector

```typescript
// packages/core/src/wpf/patterns/binding-error-detector.ts

export interface BindingError {
  type: BindingErrorType;
  xamlFile: string;
  line: number;
  bindingPath: string;
  message: string;
  suggestion?: string;
}

export type BindingErrorType =
  | 'missing-property'
  | 'wrong-type'
  | 'missing-converter'
  | 'invalid-path'
  | 'missing-datacontext';

export class BindingErrorDetector {
  async detectErrors(
    xamlData: XamlExtractionResult,
    viewModel: ViewModelAnalysis | null
  ): Promise<BindingError[]> {
    const errors: BindingError[] = [];
    
    if (!viewModel) {
      errors.push({
        type: 'missing-datacontext',
        xamlFile: xamlData.path,
        line: 1,
        bindingPath: '',
        message: 'Could not resolve DataContext for this view',
      });
      return errors;
    }
    
    for (const binding of xamlData.bindings) {
      // Check if property exists
      const property = viewModel.properties.find(p => p.name === binding.path);
      
      if (!property) {
        errors.push({
          type: 'missing-property',
          xamlFile: xamlData.path,
          line: binding.line,
          bindingPath: binding.path,
          message: `Property '${binding.path}' not found in ${viewModel.className}`,
          suggestion: this.suggestSimilarProperty(binding.path, viewModel.properties),
        });
      }
    }
    
    return errors;
  }
}
```

---

## Phase 6: CLI Commands

### 6.1 drift wpf Command

```typescript
// packages/cli/src/commands/wpf.ts

import { Command } from 'commander';

export function registerWpfCommands(program: Command): void {
  const wpf = program
    .command('wpf')
    .description('WPF framework analysis commands');

  wpf
    .command('bindings [path]')
    .description('List all XAML bindings and their targets')
    .option('--unresolved', 'Show only unresolved bindings')
    .option('--format <format>', 'Output format: table, json', 'table')
    .action(async (path, options) => {
      const analyzer = new WpfBindingAnalyzer();
      const result = await analyzer.analyzeBindings(path || process.cwd(), options);
      outputResult(result, options.format);
    });

  wpf
    .command('mvvm [path]')
    .description('Check MVVM compliance')
    .option('--strict', 'Fail on any violation')
    .action(async (path, options) => {
      const detector = new MvvmComplianceDetector();
      const result = await detector.analyze(path || process.cwd());
      console.log(`MVVM Score: ${result.score}/100`);
      if (result.violations.length > 0) {
        console.log('\nViolations:');
        for (const v of result.violations) {
          console.log(`  ${v.severity.toUpperCase()}: ${v.file}:${v.line} - ${v.message}`);
        }
      }
      if (options.strict && result.violations.length > 0) {
        process.exit(1);
      }
    });

  wpf
    .command('datacontext [path]')
    .description('Show DataContext resolution for views')
    .action(async (path) => {
      const resolver = new DataContextResolver();
      const results = await resolver.resolveAll(path || process.cwd());
      for (const r of results) {
        console.log(`${r.xamlFile}:`);
        console.log(`  DataContext: ${r.resolvedType || 'UNRESOLVED'}`);
        console.log(`  Confidence: ${r.confidence}`);
      }
    });

  wpf
    .command('commands [path]')
    .description('List all commands and their handlers')
    .action(async (path) => {
      const extractor = new CommandExtractor();
      const commands = await extractor.extractAll(path || process.cwd());
      for (const cmd of commands) {
        console.log(`${cmd.name}:`);
        console.log(`  XAML: ${cmd.xamlFile}:${cmd.xamlLine}`);
        console.log(`  Execute: ${cmd.executeMethod || 'unknown'}`);
        console.log(`  CanExecute: ${cmd.canExecuteMethod || 'none'}`);
      }
    });

  wpf
    .command('flow <element>')
    .description('Trace data flow from UI element to database')
    .action(async (element) => {
      const tracer = new WpfDataFlowTracer();
      const flow = await tracer.trace(element);
      console.log('Data Flow:');
      for (const step of flow.steps) {
        console.log(`  ${step.type}: ${step.location}`);
      }
    });
}
```

---

## Phase 7: MCP Tools

### 7.1 drift_wpf MCP Tool

```typescript
// packages/mcp/src/tools/analysis/wpf.ts

import { z } from 'zod';
import { createTool } from '../../infrastructure/tool-factory';

export const wpfTool = createTool({
  name: 'drift_wpf',
  description: 'Analyze WPF applications: bindings, MVVM compliance, data flow',
  
  inputSchema: z.object({
    action: z.enum([
      'bindings',      // List all bindings
      'mvvm',          // MVVM compliance check
      'datacontext',   // DataContext resolution
      'commands',      // Command analysis
      'flow',          // Data flow tracing
      'converters',    // Value converter usage
    ]),
    path: z.string().optional().describe('File or directory path'),
    element: z.string().optional().describe('Element name for flow tracing'),
    options: z.object({
      unresolvedOnly: z.boolean().optional(),
      includeDesignTime: z.boolean().optional(),
    }).optional(),
  }),

  async execute({ action, path, element, options }, context) {
    const projectPath = path || context.projectRoot;
    
    switch (action) {
      case 'bindings': {
        const analyzer = new WpfBindingAnalyzer();
        const bindings = await analyzer.analyzeBindings(projectPath, options);
        return {
          total: bindings.length,
          resolved: bindings.filter(b => b.resolved).length,
          unresolved: bindings.filter(b => !b.resolved).length,
          bindings: bindings.slice(0, 50), // Limit for token efficiency
        };
      }
      
      case 'mvvm': {
        const detector = new MvvmComplianceDetector();
        const result = await detector.analyze(projectPath);
        return {
          score: result.score,
          violationCount: result.violations.length,
          violations: result.violations.slice(0, 20),
          recommendations: result.recommendations,
        };
      }
      
      case 'datacontext': {
        const resolver = new DataContextResolver();
        const results = await resolver.resolveAll(projectPath);
        return {
          views: results.map(r => ({
            view: r.xamlFile,
            dataContext: r.resolvedType,
            confidence: r.confidence,
          })),
        };
      }
      
      case 'commands': {
        const extractor = new CommandExtractor();
        const commands = await extractor.extractAll(projectPath);
        return {
          total: commands.length,
          commands: commands.map(c => ({
            name: c.name,
            xamlLocation: `${c.xamlFile}:${c.xamlLine}`,
            execute: c.executeMethod,
            canExecute: c.canExecuteMethod,
          })),
        };
      }
      
      case 'flow': {
        if (!element) {
          throw new Error('Element name required for flow tracing');
        }
        const tracer = new WpfDataFlowTracer();
        const flow = await tracer.trace(element);
        return {
          element,
          steps: flow.steps,
          reachesDatabase: flow.steps.some(s => s.type === 'ef-query'),
          sensitiveData: flow.sensitiveDataAccessed,
        };
      }
      
      case 'converters': {
        const analyzer = new ValueConverterAnalyzer();
        const converters = await analyzer.analyze(projectPath);
        return {
          total: converters.length,
          converters: converters.map(c => ({
            key: c.resourceKey,
            type: c.converterClass,
            usageCount: c.usages.length,
          })),
        };
      }
    }
  },
});
```


---

## Phase 8: Project Detection

### 8.1 WPF Project Detector

```typescript
// packages/core/src/wpf/integration/wpf-project-detector.ts

export interface WpfProjectInfo {
  isWpfProject: boolean;
  projectFile: string;
  targetFramework: string;
  xamlFiles: string[];
  viewModels: string[];
  converters: string[];
  resourceDictionaries: string[];
  appXaml: string | null;
}

export class WpfProjectDetector {
  async detect(projectPath: string): Promise<WpfProjectInfo | null> {
    // Look for .csproj with WPF indicators
    const csprojFiles = await this.findCsprojFiles(projectPath);
    
    for (const csproj of csprojFiles) {
      const content = await fs.readFile(csproj, 'utf-8');
      
      // Check for WPF SDK or UseWPF
      const isWpf = this.checkWpfIndicators(content);
      
      if (isWpf) {
        return {
          isWpfProject: true,
          projectFile: csproj,
          targetFramework: this.extractTargetFramework(content),
          xamlFiles: await this.findXamlFiles(projectPath),
          viewModels: await this.findViewModels(projectPath),
          converters: await this.findConverters(projectPath),
          resourceDictionaries: await this.findResourceDictionaries(projectPath),
          appXaml: await this.findAppXaml(projectPath),
        };
      }
    }
    
    return null;
  }

  private checkWpfIndicators(csprojContent: string): boolean {
    const indicators = [
      /<UseWPF>true<\/UseWPF>/i,
      /Microsoft\.NET\.Sdk\.WindowsDesktop/,
      /<ProjectTypeGuids>.*60dc8134-eba5-43b8-bcc9-bb4bc16c2548/i, // WPF GUID
      /<Reference Include="PresentationCore"/,
      /<Reference Include="PresentationFramework"/,
    ];
    
    return indicators.some(pattern => pattern.test(csprojContent));
  }
}
```

### 8.2 Integration with Existing Scanner

```typescript
// packages/core/src/scanner/framework-detector.ts (additions)

export class FrameworkDetector {
  async detectFrameworks(projectPath: string): Promise<DetectedFrameworks> {
    const frameworks: DetectedFrameworks = {
      // Existing
      aspnetCore: false,
      entityFramework: false,
      // New
      wpf: false,
      wpfInfo: null,
    };
    
    // Existing detection...
    
    // WPF detection
    const wpfDetector = new WpfProjectDetector();
    const wpfInfo = await wpfDetector.detect(projectPath);
    if (wpfInfo) {
      frameworks.wpf = true;
      frameworks.wpfInfo = wpfInfo;
    }
    
    return frameworks;
  }
}
```

---

## Implementation Plan

### Milestone 1: Core XAML Parsing (2 weeks)
- [ ] XAML parser with XML DOM
- [ ] Binding expression extractor
- [ ] Regex fallback patterns
- [ ] Unit tests with sample XAML

### Milestone 2: C# ViewModel Integration (2 weeks)
- [ ] ViewModel hybrid extractor
- [ ] INotifyPropertyChanged detection
- [ ] ICommand extraction
- [ ] DataContext resolver

### Milestone 3: Call Graph Integration (1 week)
- [ ] WPF node types
- [ ] XAML → ViewModel edge creation
- [ ] Integration with existing C# call graph

### Milestone 4: Pattern Detection (1 week)
- [ ] MVVM compliance detector
- [ ] Binding error detector
- [ ] Code-behind anti-pattern detector

### Milestone 5: CLI + MCP (1 week)
- [ ] `drift wpf` CLI commands
- [ ] `drift_wpf` MCP tool
- [ ] Documentation

### Milestone 6: Testing & Polish (1 week)
- [ ] Integration tests with real WPF projects
- [ ] Performance optimization
- [ ] Edge case handling

---

## Example Outputs

### drift wpf bindings

```
$ drift wpf bindings

XAML Bindings Analysis
======================

MainWindow.xaml (12 bindings)
├─ TextBox.Text → MainViewModel.UserName ✓
├─ TextBox.Text → MainViewModel.Email ✓
├─ Button.Command → MainViewModel.SaveCommand ✓
├─ ListView.ItemsSource → MainViewModel.Users ✓
├─ TextBlock.Text → MainViewModel.StatusMessage ✓
└─ ComboBox.SelectedItem → MainViewModel.SelectedRole ⚠ (no setter)

UserDetailView.xaml (8 bindings)
├─ TextBox.Text → UserDetailViewModel.FirstName ✓
├─ TextBox.Text → UserDetailViewModel.LastName ✓
├─ Image.Source → UserDetailViewModel.Avatar ✓ (converter: ImageConverter)
└─ Button.Command → UserDetailViewModel.DeleteCommand ✓

Summary: 20 bindings, 19 resolved, 1 warning
```

### drift wpf mvvm

```
$ drift wpf mvvm

MVVM Compliance Score: 78/100

Violations:
  WARNING: Views/MainWindow.xaml.cs:45 - Business logic detected in code-behind
  WARNING: ViewModels/UserViewModel.cs:12 - Property 'Name' does not raise PropertyChanged
  INFO: Views/SettingsView.xaml.cs:23 - Event handler could be converted to Command

Recommendations:
  1. Move database call from MainWindow.xaml.cs to MainViewModel
  2. Add OnPropertyChanged call to UserViewModel.Name setter
  3. Consider using RelayCommand for Button_Click handler
```

### drift wpf flow SaveButton

```
$ drift wpf flow SaveButton

Data Flow: SaveButton → Database
================================

1. XAML Element: SaveButton (MainWindow.xaml:34)
   └─ Command="{Binding SaveCommand}"

2. ViewModel Command: MainViewModel.SaveCommand
   └─ Execute: SaveUser()

3. ViewModel Method: MainViewModel.SaveUser()
   └─ Calls: _userService.SaveAsync(CurrentUser)

4. Service Method: UserService.SaveAsync()
   └─ Calls: _context.Users.Update(user)

5. Entity Framework: AppDbContext.Users
   └─ Table: dbo.Users

Sensitive Data Accessed: [Email, PasswordHash]
```

### MCP Tool Response

```json
{
  "action": "flow",
  "element": "SaveButton",
  "result": {
    "element": "SaveButton",
    "steps": [
      { "type": "xaml-element", "location": "MainWindow.xaml:34" },
      { "type": "binding", "path": "SaveCommand" },
      { "type": "viewmodel-command", "location": "MainViewModel.cs:89" },
      { "type": "method-call", "location": "MainViewModel.cs:95" },
      { "type": "service-call", "location": "UserService.cs:42" },
      { "type": "ef-query", "location": "UserService.cs:45", "table": "Users" }
    ],
    "reachesDatabase": true,
    "sensitiveData": ["Email", "PasswordHash"]
  }
}
```

---

## Dependencies

### New Dependencies
- `fast-xml-parser` - Fast XML parsing for XAML
- No new Tree-sitter grammar needed (XAML is XML, C# already supported)

### Existing Infrastructure Used
- `HybridExtractorBase` - AST + regex fallback pattern
- `CallGraphBuilder` - Graph construction
- `CSharpHybridExtractor` - C# parsing
- `CSharpDataAccessExtractor` - Entity Framework detection

---

## Testing Strategy

### Unit Tests
- XAML binding extraction (various binding syntaxes)
- ViewModel property detection
- DataContext resolution
- Regex fallback accuracy

### Integration Tests
- Full WPF project scan
- Call graph generation
- Pattern detection accuracy

### Test Projects
- Simple MVVM app (clean architecture)
- Legacy WPF app (code-behind heavy)
- MVVM Toolkit app (source generators)
- Prism/Caliburn.Micro app (framework-specific patterns)

---

## Future Considerations

### Phase 2 Enhancements
- WinUI 3 / MAUI support (similar XAML patterns)
- Prism framework detection
- Caliburn.Micro conventions
- ReactiveUI support
- Design-time data analysis

### Galaxy Visualization
- XAML views as "stations"
- ViewModels as "planets"
- Bindings as "data lanes"
- Commands as "action routes"
