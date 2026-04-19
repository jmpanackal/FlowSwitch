import type { ContentFolder, ContentItem } from "../components/ContentManager";

function collectCascadeDelete(
  folders: ContentFolder[],
  _items: ContentItem[],
  rootFolderId: string,
): { folderIds: Set<string>; itemIds: Set<string> } {
  const folderIds = new Set<string>();
  const itemIds = new Set<string>();
  const queue = [rootFolderId];
  while (queue.length) {
    const fid = queue.shift()!;
    if (folderIds.has(fid)) continue;
    folderIds.add(fid);
    const folder = folders.find((f) => f.id === fid);
    for (const cid of folder?.children || []) {
      const sub = folders.find((f) => f.id === cid);
      if (sub) queue.push(sub.id);
      else itemIds.add(cid);
    }
  }
  return { folderIds, itemIds };
}

function stripDeletedFromChildren(
  folders: ContentFolder[],
  folderIds: Set<string>,
  itemIds: Set<string>,
): ContentFolder[] {
  return folders
    .filter((f) => !folderIds.has(f.id))
    .map((f) => ({
      ...f,
      children: (f.children || []).filter(
        (c) => !folderIds.has(c) && !itemIds.has(c),
      ),
    }));
}

export function deleteLibraryFolder(
  folders: ContentFolder[],
  items: ContentItem[],
  rootFolderId: string,
): { items: ContentItem[]; folders: ContentFolder[] } {
  const { folderIds, itemIds } = collectCascadeDelete(folders, items, rootFolderId);
  const nextItems = items.filter((i) => !itemIds.has(i.id));
  const nextFolders = stripDeletedFromChildren(folders, folderIds, itemIds);
  return { items: nextItems, folders: nextFolders };
}

export function deleteLibraryItem(
  items: ContentItem[],
  folders: ContentFolder[],
  itemId: string,
): { items: ContentItem[]; folders: ContentFolder[] } {
  const nextItems = items.filter((i) => i.id !== itemId);
  const nextFolders = folders.map((f) => ({
    ...f,
    children: (f.children || []).filter((c) => c !== itemId),
  }));
  return { items: nextItems, folders: nextFolders };
}
