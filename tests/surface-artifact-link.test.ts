import { expect, test } from 'vitest'

import {
  buildArchiveViewerUrlFromSource,
  extractArtifactLinksFromText,
  normalizeSurfaceArtifacts,
  toArtifactUrl,
} from '../src/surface/shared/artifact-link.js'

test('toArtifactUrl rewrites relative workspace markdown paths including cjk names', () => {
  expect(toArtifactUrl('plans/report.md')).toBe(
    buildArchiveViewerUrlFromSource('/api/workspace-file?path=plans%2Freport.md'),
  )
  expect(toArtifactUrl('计划/报告.md')).toBe(
    buildArchiveViewerUrlFromSource(
      '/api/workspace-file?path=%E8%AE%A1%E5%88%92%2F%E6%8A%A5%E5%91%8A.md',
    ),
  )
})

test('toArtifactUrl preserves workspace path suffixes such as line anchors', () => {
  expect(toArtifactUrl('plans/report.md#L12')).toBe(
    buildArchiveViewerUrlFromSource(
      '/api/workspace-file?path=plans%2Freport.md#L12',
    ),
  )
})

test('toArtifactUrl decodes file urls before building workspace links for cjk paths', () => {
  expect(
    toArtifactUrl('file:///Users/mimiko/%E4%B8%AD%E6%96%87/%E6%8A%A5%E5%91%8A.md'),
  ).toBe(
    buildArchiveViewerUrlFromSource(
      '/api/workspace-file?path=%2FUsers%2Fmimiko%2F%E4%B8%AD%E6%96%87%2F%E6%8A%A5%E5%91%8A.md',
    ),
  )
})

test('toArtifactUrl normalizes windows file urls before building workspace links', () => {
  expect(
    toArtifactUrl(
      'file:///C:/Users/mimiko/%E8%AE%A1%E5%88%92/%E6%8A%A5%E5%91%8A.md',
    ),
  ).toBe(
    buildArchiveViewerUrlFromSource(
      '/api/workspace-file?path=C%3A%2FUsers%2Fmimiko%2F%E8%AE%A1%E5%88%92%2F%E6%8A%A5%E5%91%8A.md',
    ),
  )
})

test('extractArtifactLinksFromText collects local file references once from text', () => {
  expect(
    extractArtifactLinksFromText(
      ['任务归档：.mimikit/tasks/任务.md', '补充路径：计划/报告.md'].join('\n'),
    ),
  ).toEqual([
    {
      href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2F%25E4%25BB%25BB%25E5%258A%25A1.md',
      label: '.mimikit/tasks/任务.md',
      path: '.mimikit/tasks/任务.md',
    },
    {
      href: '/archive-viewer.html?src=%2Fapi%2Fworkspace-file%3Fpath%3D%25E8%25AE%25A1%25E5%2588%2592%252F%25E6%258A%25A5%25E5%2591%258A.md',
      label: '计划/报告.md',
      path: '计划/报告.md',
    },
  ])
})

test('extractArtifactLinksFromText handles quoted cjk paths', () => {
  expect(extractArtifactLinksFromText('请看“计划/报告.md”。')).toEqual([
    {
      href: '/archive-viewer.html?src=%2Fapi%2Fworkspace-file%3Fpath%3D%25E8%25AE%25A1%25E5%2588%2592%252F%25E6%258A%25A5%25E5%2591%258A.md',
      label: '计划/报告.md',
      path: '计划/报告.md',
    },
  ])
})

test('normalizeSurfaceArtifacts drops unsupported refs and keeps parseable artifacts', () => {
  expect(
    normalizeSurfaceArtifacts([
      { path: '.mimikit/tasks/task-1.md', note: '任务归档', kind: 'task_archive' },
      { path: 'https://example.com/not-local' },
      { path: '' },
    ]),
  ).toEqual([
    {
      href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-1.md',
      kind: 'task_archive',
      label: '.mimikit/tasks/task-1.md',
      note: '任务归档',
      path: '.mimikit/tasks/task-1.md',
    },
  ])
})
