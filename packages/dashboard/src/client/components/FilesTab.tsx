/**
 * Files Tab Component
 *
 * Displays file tree with pattern/violation counts and file details.
 */

import React, { useState } from 'react';

import { useFileTree, useFileDetails } from '../hooks';
import { useDashboardStore } from '../store';

import type { FileTreeNode, Severity } from '../types';

function FileTreeItem({
  node,
  depth = 0,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode;
  depth?: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const { expandedFolders, toggleFolderExpanded } = useDashboardStore();
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';

  const handleClick = () => {
    if (isDirectory) {
      toggleFolderExpanded(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const severityColor = node.severity ? {
    error: 'text-severity-error',
    warning: 'text-severity-warning',
    info: 'text-severity-info',
    hint: 'text-severity-hint',
  }[node.severity] : '';

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full text-left px-2 py-1 rounded text-sm flex items-center gap-2 hover:bg-dark-border/50 ${
          isSelected ? 'bg-blue-500/20 text-blue-400' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Icon */}
        <span className="w-4 text-center text-dark-muted">
          {isDirectory ? (isExpanded ? '📂' : '📁') : '📄'}
        </span>

        {/* Name */}
        <span className={`flex-1 truncate ${severityColor}`}>{node.name}</span>

        {/* Counts */}
        {(node.patternCount || node.violationCount) && (
          <span className="text-xs text-dark-muted">
            {node.patternCount ? `${node.patternCount}P` : ''}
            {node.patternCount && node.violationCount ? ' ' : ''}
            {node.violationCount ? `${node.violationCount}V` : ''}
          </span>
        )}
      </button>

      {/* Children */}
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileDetail({ path }: { path: string }) {
  const { data: details, isLoading, error } = useFileDetails(path);

  if (isLoading) {
    return <div className="text-dark-muted">Loading file details...</div>;
  }

  if (error || !details) {
    return <div className="text-severity-error">Failed to load file details</div>;
  }

  return (
    <div className="space-y-4">
      {/* File info */}
      <div>
        <h3 className="font-medium truncate" title={details.path}>
          {details.path.split('/').pop()}
        </h3>
        <div className="text-sm text-dark-muted mt-1">
          <span>{details.language}</span>
          <span className="mx-2">•</span>
          <span>{details.lineCount} lines</span>
        </div>
      </div>

      {/* Patterns in file */}
      {details.patterns.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Patterns ({details.patterns.length})
          </h4>
          <div className="space-y-2">
            {details.patterns.map((p) => (
              <div key={p.id} className="p-2 bg-dark-bg rounded text-sm">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-dark-muted mt-1">
                  {p.category} • {p.locations.length} locations
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violations in file */}
      {details.violations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Violations ({details.violations.length})
          </h4>
          <div className="space-y-2">
            {details.violations.map((v) => (
              <div key={v.id} className="p-2 bg-dark-bg rounded text-sm">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs badge-${v.severity}`}>
                    {v.severity}
                  </span>
                  <span className="truncate">{v.message}</span>
                </div>
                <div className="text-xs text-dark-muted mt-1">
                  Line {v.range.start.line}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No patterns or violations */}
      {details.patterns.length === 0 && details.violations.length === 0 && (
        <div className="text-dark-muted text-sm">
          No patterns or violations in this file
        </div>
      )}
    </div>
  );
}

export function FilesTab(): React.ReactElement {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { data: tree, isLoading, error } = useFileTree();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading file tree...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-severity-error">Failed to load file tree</div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* File tree */}
      <div className="w-80 shrink-0">
        <div className="card max-h-[600px] overflow-y-auto scrollbar-dark">
          {tree && tree.length > 0 ? (
            tree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            ))
          ) : (
            <div className="text-dark-muted text-center py-4">
              No files found
            </div>
          )}
        </div>
      </div>

      {/* File details */}
      <div className="flex-1">
        <div className="card">
          {selectedPath ? (
            <FileDetail path={selectedPath} />
          ) : (
            <div className="text-dark-muted text-center py-8">
              Select a file to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
