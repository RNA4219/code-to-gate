/**
 * Report JavaScript Generators
 * JavaScript code for report interactivity
 */

import { getMermaidJavaScript } from "./graph-viewer.js";

/**
 * Get JavaScript for report interactivity
 */
export function getReportJavaScript(config: { darkModeDefault?: boolean }): string {
  const darkModeDefault = config.darkModeDefault ? "dark" : "light";

  return `
<script>
// Theme toggle
let currentTheme = '${darkModeDefault}';

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.getElementById('theme-label').textContent =
    currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// Initialize theme
document.documentElement.setAttribute('data-theme', currentTheme);

// Tab navigation
function showTab(tabId) {
  // Update button states
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // Show/hide content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(tabId + '-tab').classList.add('active');
}

// Collapsible sections
function toggleSection(id) {
  const content = document.getElementById('content-' + id);
  const icon = document.getElementById('icon-' + id);

  if (content) {
    content.classList.toggle('active');
  }
  if (icon) {
    icon.classList.toggle('open');
  }
}

// Initialize first tab
document.addEventListener('DOMContentLoaded', function() {
  // Initialize Mermaid if available
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
  }

  // Expand critical findings by default
  const criticalSection = document.getElementById('content-critical-section');
  if (criticalSection) {
    criticalSection.classList.add('active');
  }

  // Add keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.collapsible-content.active').forEach(el => {
        el.classList.remove('active');
      });
    }
  });
});
</script>
${getMermaidJavaScript()}
`;
}