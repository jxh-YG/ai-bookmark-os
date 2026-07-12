# -*- coding: utf-8 -*-
"""Lightweight unit checks for respect-existing-folders helpers.
Mirrors logic from classifier.ts without chrome APIs.
"""
from __future__ import annotations

ROOT_ALIASES = {
  '书签栏','书签菜单','其他书签','移动设备书签',
  'bookmarks bar','bookmarks menu','other bookmarks','mobile bookmarks',
  '收藏夹栏','其他收藏夹',
}

def normalize_folder_parts(folder_path: str, max_depth=3):
    parts = [p.strip() for p in str(folder_path or '').split('/') if p.strip()]
    out = []
    for p in parts:
        if p.lower() in ROOT_ALIASES or p in ROOT_ALIASES:
            continue
        out.append(p)
    return out if max_depth is None else out[:max_depth]

def folder_key(folder_path: str) -> str:
    return '/'.join(normalize_folder_parts(folder_path))

def full_folder_key(folder_path: str) -> str:
    return '/'.join(normalize_folder_parts(folder_path, None))

def derive_tree(bookmarks, max_depth=3):
    root = {}
    for b in bookmarks:
        parts = normalize_folder_parts(b['folderPath'], max_depth)
        if not parts:
            continue
        level = root
        for name in parts:
            node = level.setdefault(name, {'name': name, 'children': {}})
            level = node['children']
    def to_nodes(level):
        nodes = []
        for name in sorted(level.keys()):
            n = level[name]
            children = to_nodes(n['children'])
            nodes.append({'name': name, 'children': children} if children else {'name': name})
        return nodes
    return to_nodes(root)

def is_in_preserved_folder(bookmark, paths):
    key = full_folder_key(bookmark['folderPath'])
    return any(key == p or key.startswith(p + '/') for p in paths)

def build_preserved_tree(bookmarks, paths):
    preserved = [b for b in bookmarks if is_in_preserved_folder(b, paths)]
    tree = derive_tree(preserved, None)
    def attach_ids(nodes, prefix=None):
        prefix = prefix or []
        for n in nodes:
            path = prefix + [n['name']]
            kids = n.get('children') or []
            if kids:
                attach_ids(kids, path)
            ids = [b['id'] for b in preserved if normalize_folder_parts(b['folderPath'], None) == path]
            if ids:
                n['bookmarkIds'] = ids
    attach_ids(tree)
    return tree

def leaf_paths(tree, prefix=None):
    prefix = prefix or []
    paths = []
    for n in tree:
        p = prefix + [n['name']]
        kids = n.get('children') or []
        if kids:
            paths.extend(leaf_paths(kids, p))
        else:
            paths.append('/'.join(p))
    return paths

# fixtures: company folders should survive
bookmarks = [
  {'id':'1','folderPath':'书签栏/办公/字节跳动/飞书'},
  {'id':'2','folderPath':'书签栏/办公/字节跳动/OKR'},
  {'id':'3','folderPath':'书签栏/办公/阿里巴巴/钉钉'},
  {'id':'4','folderPath':'书签栏/学习/前端'},
  {'id':'5','folderPath':'书签栏'},  # no meaningful folder
]

tree = derive_tree(bookmarks)
paths = leaf_paths(tree)
print('tree', tree)
print('paths', paths)

# expectations
assert any('字节跳动' in p for p in paths), 'company folder missing'
assert any('阿里巴巴' in p for p in paths), 'company folder missing'
assert folder_key('书签栏/办公/字节跳动') == '办公/字节跳动'
assert full_folder_key('书签栏/办公/字节跳动/飞书') == '办公/字节跳动/飞书'

# preserved folders are direct tree branches; non-selected folders remain optimizable
preserved_tree = build_preserved_tree(bookmarks, {'办公/字节跳动'})
preserved_paths = leaf_paths(preserved_tree)
print('preserved_tree', preserved_tree)
assert preserved_paths == ['办公/字节跳动/OKR', '办公/字节跳动/飞书']
assert is_in_preserved_folder(bookmarks[0], {'办公/字节跳动'})
assert not is_in_preserved_folder(bookmarks[2], {'办公/字节跳动'})

# respect on is now a reference signal; only selected folders are locked unchanged
print('ACCEPTANCE PASS')
