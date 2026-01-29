/**
 * ProjectSwitcher Component
 *
 * Dropdown component for switching between registered drift projects.
 * Shows project name, health status, and allows quick switching.
 */

import React, { useState, useEffect, useRef } from 'react';

interface Project {
  id: string;
  name: string;
  path: string;
  language: string;
  framework: string;
  health?: 'healthy' | 'warning' | 'critical' | 'unknown';
  healthScore?: number;
  lastAccessedAt: string;
  isActive: boolean;
  isValid: boolean;
}

interface ProjectsResponse {
  totalProjects: number;
  activeProject: string | null;
  projects: Project[];
}

const healthColors: Record<string, string> = {
  healthy: 'bg-green-500',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500',
  unknown: 'bg-gray-400',
};

const languageColors: Record<string, string> = {
  typescript: 'text-blue-400',
  javascript: 'text-yellow-400',
  python: 'text-green-400',
  java: 'text-red-400',
  csharp: 'text-purple-400',
  php: 'text-indigo-400',
  ruby: 'text-red-300',
  go: 'text-cyan-400',
  rust: 'text-orange-400',
};

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {return 'today';}
  if (diffDays === 1) {return 'yesterday';}
  if (diffDays < 7) {return `${diffDays}d ago`;}
  if (diffDays < 30) {return `${Math.floor(diffDays / 7)}w ago`;}
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen) {return p;}
  return '...' + p.slice(-(maxLen - 3));
}

export function ProjectSwitcher(): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      const response = await fetch('/api/projects');
      
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data: ProjectsResponse = await response.json();
      setProjects(data.projects);
      setActiveProject(data.projects.find(p => p.isActive) ?? null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function switchProject(projectId: string) {
    try {
      const response = await fetch('/api/projects/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        throw new Error('Failed to switch project');
      }

      // Refresh projects and reload page
      await fetchProjects();
      setIsOpen(false);
      
      // Reload to refresh all data for new project
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
        <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-red-400">
        <span className="text-sm">⚠ {error}</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-gray-500">
        <span className="text-sm">No projects</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700"
      >
        {/* Health indicator */}
        <div
          className={`w-2 h-2 rounded-full ${
            healthColors[activeProject?.health ?? 'unknown']
          }`}
        />

        {/* Project name */}
        <span className="text-sm font-medium text-white max-w-[150px] truncate">
          {activeProject?.name ?? 'Select Project'}
        </span>

        {/* Language badge */}
        {activeProject && (
          <span
            className={`text-xs ${
              languageColors[activeProject.language] ?? 'text-gray-400'
            }`}
          >
            {activeProject.language}
          </span>
        )}

        {/* Dropdown arrow */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-900">
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Projects ({projects.length})
            </span>
          </div>

          {/* Project List */}
          <div className="max-h-80 overflow-y-auto">
            {projects.map(project => (
              <button
                key={project.id}
                onClick={() => switchProject(project.id)}
                className={`w-full px-3 py-2 flex items-start gap-3 hover:bg-gray-700 transition-colors text-left ${
                  project.isActive ? 'bg-gray-700/50' : ''
                }`}
              >
                {/* Health indicator */}
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    healthColors[project.health ?? 'unknown']
                  }`}
                />

                {/* Project info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {project.name}
                    </span>
                    {project.isActive && (
                      <span className="text-xs text-cyan-400">●</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-xs ${
                        languageColors[project.language] ?? 'text-gray-400'
                      }`}
                    >
                      {project.language}
                    </span>
                    {project.framework !== 'unknown' && (
                      <>
                        <span className="text-gray-600">•</span>
                        <span className="text-xs text-gray-400">
                          {project.framework}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {truncatePath(project.path, 40)}
                  </div>
                </div>

                {/* Last accessed */}
                <div className="text-xs text-gray-500 flex-shrink-0">
                  {formatRelativeTime(project.lastAccessedAt)}
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-700 bg-gray-900">
            <span className="text-xs text-gray-500">
              Use <code className="text-gray-400">drift projects</code> to manage
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectSwitcher;
