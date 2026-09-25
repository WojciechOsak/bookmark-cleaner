const els = {
  folderTree: document.querySelector("#folderTree"),
  items: document.querySelector("#items"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  viewTitle: document.querySelector("#viewTitle"),
  search: document.querySelector("#searchInput"),
  resultCount: document.querySelector("#resultCount"),
  selectAll: document.querySelector("#selectAll"),
  deleteSelected: document.querySelector("#deleteSelectedBtn"),
  undo: document.querySelector("#undoBtn"),
  sort: document.querySelector("#sortSelect"),
  showAll: document.querySelector("#showAllBtn"),
  emptyFolders: document.querySelector("#emptyFoldersBtn"),
  notice: document.querySelector("#notice"),
  dragGhost: document.querySelector("#dragGhost")
};

let roots = [];
let nodeById = new Map();
let parentById = new Map();
let selectedFolderId = null;
let mode = "all"; // folder | all | empty
let selectedIds = new Set();
let visibleNodes = [];
let collapsedFolders = new Set();
let draggedNodeId = null;

const ICONS = {
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.7-3.7"/></svg>`,
  bookmarks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 4.7A2.7 2.7 0 0 1 8.7 2h8.6A2.7 2.7 0 0 1 20 4.7V19l-5-3-5 3V4.7"/><path d="M4 6v14l4-2.4"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6.5 4.5A2.5 2.5 0 0 1 9 2h6a2.5 2.5 0 0 1 2.5 2.5V21L12 17.5 6.5 21z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5h6l2 2h10v9.5A2 2 0 0 1 19 20H5a2 2 0 0 1-2-2z"/><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2.5"/></svg>`,
  "folder-empty": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7A2 2 0 0 1 5 5h4l2 2"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16"/><path d="M9 3h6l1 4H8z"/><path d="M7 7l1 14h8l1-14"/><path d="M10 11v6M14 11v6"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`
};

init();

async function init() {
  hydrateStaticIcons();
  bindEvents();
  await refresh();
  await updateUndoState();
}

function hydrateStaticIcons() {
  document.querySelectorAll("[data-icon]").forEach(el => {
    const name = el.dataset.icon;
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });
}

function bindEvents() {
  els.search.addEventListener("input", () => {
    mode = els.search.value.trim() ? "all" : (selectedFolderId ? "folder" : "all");
    selectedIds.clear();
    render();
  });

  els.sort.addEventListener("change", renderItems);

  els.selectAll.addEventListener("change", () => {
    if (els.selectAll.checked) visibleNodes.forEach(n => selectedIds.add(n.id));
    else visibleNodes.forEach(n => selectedIds.delete(n.id));
    renderItems();
  });

  els.deleteSelected.addEventListener("click", deleteSelected);
  els.undo.addEventListener("click", undoLastDelete);

  els.showAll.addEventListener("click", () => {
    selectedFolderId = null;
    mode = "all";
    els.search.value = "";
    selectedIds.clear();
    render();
  });

  els.emptyFolders.addEventListener("click", () => {
    selectedFolderId = null;
    mode = "empty";
    els.search.value = "";
    selectedIds.clear();
    render();
  });
}

async function refresh() {
  roots = await chrome.bookmarks.getTree();
  rebuildIndexes();
  if (selectedFolderId && !nodeById.has(selectedFolderId)) {
    selectedFolderId = null;
    mode = "all";
  }
  render();
}

function rebuildIndexes() {
  nodeById = new Map();
  parentById = new Map();

  const walk = (node, parentId = null) => {
    nodeById.set(node.id, node);
    if (parentId !== null) parentById.set(node.id, parentId);
    for (const child of node.children || []) walk(child, node.id);
  };

  for (const root of roots) walk(root);
}

function render() {
  renderTree();
  renderBreadcrumbs();
  renderViewTitle();
  renderItems();
}

function renderTree() {
  els.folderTree.textContent = "";
  const root = roots[0];
  const topFolders = (root?.children || []).filter(n => !n.url);

  for (const folder of topFolders) {
    els.folderTree.appendChild(renderTreeNode(folder, 0));
  }
}

function renderTreeNode(folder, depth) {
  const wrap = document.createElement("div");
  wrap.className = "tree-wrap";

  const subfolders = (folder.children || []).filter(n => !n.url);
  const isCollapsed = collapsedFolders.has(folder.id);

  const row = document.createElement("div");
  row.className = "tree-node" + (folder.id === selectedFolderId ? " active" : "");
  row.dataset.folderId = folder.id;

  const chev = document.createElement("div");
  chev.className = "tree-chevron" + (subfolders.length ? "" : " empty");
  chev.innerHTML = ICONS.chevron;
  chev.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(90deg)";
  chev.addEventListener("click", e => {
    e.stopPropagation();
    if (!subfolders.length) return;
    if (collapsedFolders.has(folder.id)) collapsedFolders.delete(folder.id);
    else collapsedFolders.add(folder.id);
    renderTree();
  });

  const folderIcon = document.createElement("div");
  folderIcon.className = "tree-folder-icon";
  folderIcon.innerHTML = ICONS.folder;

  const name = document.createElement("div");
  name.className = "tree-name";
  name.textContent = folder.title || "(bez nazwy)";

  const count = document.createElement("div");
  count.className = "tree-count";
  count.textContent = countDescendantBookmarks(folder);

  const del = document.createElement("button");
  del.className = "tree-delete";
  del.title = "Usuń folder";
  del.innerHTML = ICONS.trash;
  del.addEventListener("click", async e => {
    e.stopPropagation();
    await deleteNodes([folder.id]);
  });

  row.append(chev, folderIcon, name, count, del);

  row.addEventListener("click", () => {
    selectedFolderId = folder.id;
    mode = "folder";
    els.search.value = "";
    selectedIds.clear();
    render();
  });

  bindFolderDropTarget(row, folder);

  wrap.appendChild(row);

  if (subfolders.length && !isCollapsed) {
    const children = document.createElement("div");
    children.className = "tree-children";
    for (const sub of subfolders) {
      children.appendChild(renderTreeNode(sub, depth + 1));
    }
    wrap.appendChild(children);
  }

  return wrap;
}

function bindFolderDropTarget(el, targetFolder) {
  el.addEventListener("dragover", e => {
    if (!draggedNodeId) return;
    if (!canMoveToFolder(draggedNodeId, targetFolder.id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    el.classList.add("drop-target");
  });

  el.addEventListener("dragleave", () => {
    el.classList.remove("drop-target");
  });

  el.addEventListener("drop", async e => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("drop-target");

    const nodeId = draggedNodeId || e.dataTransfer.getData("text/plain");
    if (!nodeId) return;

    if (!canMoveToFolder(nodeId, targetFolder.id)) {
      showNotice("Nie można przenieść folderu do niego samego ani do jego podfolderu.");
      return;
    }

    await moveNode(nodeId, targetFolder.id);
  });
}

function canMoveToFolder(nodeId, targetFolderId) {
  if (!nodeId || !targetFolderId) return false;
  if (nodeId === targetFolderId) return false;

  const node = nodeById.get(nodeId);
  const target = nodeById.get(targetFolderId);
  if (!node || !target || target.url) return false;

  // Nie przenoś bezpośrednio do aktualnego rodzica.
  if (parentById.get(nodeId) === targetFolderId) return false;

  // Dla folderu: nie wolno wrzucić go do własnego potomka.
  if (!node.url) {
    let cursor = targetFolderId;
    while (cursor) {
      if (cursor === nodeId) return false;
      cursor = parentById.get(cursor);
    }
  }

  return true;
}

async function moveNode(nodeId, targetFolderId) {
  const node = nodeById.get(nodeId);
  const target = nodeById.get(targetFolderId);
  if (!node || !target) return;

  try {
    await chrome.bookmarks.move(nodeId, { parentId: targetFolderId });
    showNotice(`Przeniesiono „${node.title || "element"}” do „${target.title || "folderu"}”.`);
    selectedIds.delete(nodeId);
    await refresh();
  } catch (error) {
    alert(`Nie udało się przenieść elementu: ${error?.message || error}`);
  }
}

function renderBreadcrumbs() {
  els.breadcrumbs.textContent = "";

  if (mode === "all" && !els.search.value.trim()) {
    els.breadcrumbs.textContent = "Biblioteka";
    return;
  }

  if (mode === "empty") {
    els.breadcrumbs.textContent = "Biblioteka";
    return;
  }

  if (els.search.value.trim()) {
    els.breadcrumbs.textContent = "Wyszukiwanie";
    return;
  }

  if (!selectedFolderId) return;

  const chain = [];
  let id = selectedFolderId;

  while (id && nodeById.has(id)) {
    const node = nodeById.get(id);
    if (node.id === "0") break;
    chain.unshift(node);
    id = parentById.get(id);
  }

  chain.forEach((node, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.textContent = "›";
      els.breadcrumbs.appendChild(sep);
    }

    const crumb = document.createElement("span");
    crumb.className = "crumb" + (i === chain.length - 1 ? " current" : "");
    crumb.textContent = node.title || "(bez nazwy)";

    if (i !== chain.length - 1) {
      crumb.addEventListener("click", () => {
        selectedFolderId = node.id;
        mode = "folder";
        selectedIds.clear();
        render();
      });
    }

    els.breadcrumbs.appendChild(crumb);
  });
}

function renderViewTitle() {
  if (els.search.value.trim()) {
    els.viewTitle.textContent = `Wyniki dla „${els.search.value.trim()}”`;
  } else if (mode === "empty") {
    els.viewTitle.textContent = "Puste foldery";
  } else if (mode === "all") {
    els.viewTitle.textContent = "Wszystkie zakładki";
  } else if (selectedFolderId) {
    els.viewTitle.textContent = nodeById.get(selectedFolderId)?.title || "Folder";
  } else {
    els.viewTitle.textContent = "Zakładki";
  }
}

function renderItems() {
  els.items.textContent = "";
  visibleNodes = sortNodes(getVisibleNodes());

  const visibleIdSet = new Set(visibleNodes.map(n => n.id));
  for (const id of [...selectedIds]) {
    if (!visibleIdSet.has(id)) selectedIds.delete(id);
  }

  els.resultCount.textContent = `${visibleNodes.length} ${visibleNodes.length === 1 ? "pozycja" : "pozycji"}`;

  if (!visibleNodes.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = els.search.value.trim()
      ? "Brak wyników."
      : mode === "empty"
        ? "Nie masz pustych folderów."
        : "Ten widok jest pusty.";
    els.items.appendChild(empty);
  } else {
    for (const node of visibleNodes) els.items.appendChild(renderRow(node));
  }

  const selectedVisibleCount = visibleNodes.filter(n => selectedIds.has(n.id)).length;
  els.selectAll.checked = visibleNodes.length > 0 && selectedVisibleCount === visibleNodes.length;
  els.selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleNodes.length;
  els.deleteSelected.disabled = selectedIds.size === 0;
  els.deleteSelected.lastChild.textContent = selectedIds.size
    ? ` Usuń zaznaczone (${selectedIds.size})`
    : " Usuń zaznaczone";
}

function getVisibleNodes() {
  const q = els.search.value.trim().toLowerCase();

  if (q) {
    return allNodes()
      .filter(n => !isChromeRoot(n))
      .filter(n => {
        const title = (n.title || "").toLowerCase();
        const url = (n.url || "").toLowerCase();
        return title.includes(q) || url.includes(q);
      });
  }

  if (mode === "empty") {
    return allNodes().filter(n => !n.url && !isChromeRoot(n) && (n.children || []).length === 0);
  }

  if (mode === "all") {
    return allNodes().filter(n => !!n.url);
  }

  const folder = nodeById.get(selectedFolderId);
  return folder?.children ? [...folder.children] : [];
}

function sortNodes(nodes) {
  const copy = [...nodes];
  const sortMode = els.sort.value;

  if (sortMode === "name") {
    return copy.sort((a, b) => (a.title || "").localeCompare(b.title || "", "pl"));
  }
  if (sortMode === "newest") {
    return copy.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  }
  if (sortMode === "oldest") {
    return copy.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
  }
  return copy;
}

function renderRow(node) {
  const row = document.createElement("div");
  row.className = "row";
  row.draggable = true;
  row.dataset.nodeId = node.id;

  const checkbox = document.createElement("input");
  checkbox.className = "row-check";
  checkbox.type = "checkbox";
  checkbox.checked = selectedIds.has(node.id);
  checkbox.addEventListener("click", e => e.stopPropagation());
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedIds.add(node.id);
    else selectedIds.delete(node.id);
    renderItems();
  });

  const icon = document.createElement("div");
  icon.className = "item-icon" + (node.url ? "" : " folder");
  const iconSlot = document.createElement("div");
  iconSlot.className = "icon-slot";
  iconSlot.innerHTML = node.url ? ICONS.bookmark : ICONS.folder;
  icon.appendChild(iconSlot);

  const main = document.createElement("div");
  main.className = "row-main";

  const title = document.createElement("div");
  title.className = "row-title";
  title.textContent = node.title || (node.url ? "(zakładka bez nazwy)" : "(folder bez nazwy)");

  const subtitle = document.createElement("div");
  subtitle.className = "row-subtitle";

  if (node.url) {
    subtitle.textContent = node.url;
    subtitle.title = node.url;
    main.addEventListener("click", () => chrome.tabs.create({ url: node.url }));
  } else {
    subtitle.textContent = `${countDescendantBookmarks(node)} zakładek · ${countDescendantFolders(node)} podfolderów`;
    main.addEventListener("click", () => openFolder(node.id));
    bindFolderDropTarget(row, node);
  }

  main.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "row-actions";

  if (node.url) {
    actions.appendChild(iconButton("Otwórz", ICONS.external, () => chrome.tabs.create({ url: node.url })));
  } else {
    actions.appendChild(iconButton("Wejdź do folderu", ICONS.arrow, () => openFolder(node.id)));
  }

  actions.appendChild(iconButton(node.url ? "Usuń zakładkę" : "Usuń folder", ICONS.trash, () => deleteNodes([node.id]), true));

  row.append(checkbox, icon, main, actions);

  row.addEventListener("dragstart", e => {
    draggedNodeId = node.id;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);

    els.dragGhost.textContent = node.title || (node.url ? "Zakładka" : "Folder");
    els.dragGhost.classList.remove("hidden");
    if (e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(els.dragGhost, 10, 10);
    }
  });

  row.addEventListener("dragend", () => {
    draggedNodeId = null;
    row.classList.remove("dragging");
    els.dragGhost.classList.add("hidden");
    document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
  });

  return row;
}

function openFolder(id) {
  selectedFolderId = id;
  mode = "folder";
  els.search.value = "";
  selectedIds.clear();
  render();
}

function iconButton(title, iconSvg, handler, danger = false) {
  const btn = document.createElement("button");
  btn.className = "icon-btn" + (danger ? " delete" : "");
  btn.title = title;
  btn.innerHTML = iconSvg;
  btn.addEventListener("click", e => {
    e.stopPropagation();
    handler();
  });
  return btn;
}

async function deleteSelected() {
  if (!selectedIds.size) return;
  await deleteNodes([...selectedIds]);
}

async function deleteNodes(ids) {
  const filtered = ids
    .map(id => nodeById.get(id))
    .filter(Boolean)
    .filter(n => !isChromeRoot(n));

  if (!filtered.length) return;

  const selectedSet = new Set(filtered.map(n => n.id));

  const topLevel = filtered.filter(node => {
    let parent = parentById.get(node.id);
    while (parent) {
      if (selectedSet.has(parent)) return false;
      parent = parentById.get(parent);
    }
    return true;
  });

  const bookmarkCount = topLevel.reduce((sum, n) => sum + (n.url ? 1 : countDescendantBookmarks(n)), 0);
  const folderCount = topLevel.reduce((sum, n) => sum + (n.url ? 0 : 1 + countDescendantFolders(n)), 0);

  const message = [
    "Usunąć zaznaczone elementy?",
    bookmarkCount ? `Zakładki: ${bookmarkCount}` : "",
    folderCount ? `Foldery: ${folderCount}` : "",
    "",
    folderCount ? "Usunięcie folderu usuwa również całą jego zawartość." : "",
    "Ostatnią operację możesz cofnąć przyciskiem „Cofnij”."
  ].filter(Boolean).join("\n");

  if (!confirm(message)) return;

  const snapshots = topLevel.map(snapshotNode);

  try {
    for (const node of topLevel) {
      if (node.url) await chrome.bookmarks.remove(node.id);
      else await chrome.bookmarks.removeTree(node.id);
    }

    await chrome.storage.local.set({
      lastDeletedBatch: {
        deletedAt: Date.now(),
        items: snapshots
      }
    });

    selectedIds.clear();
    showNotice(`Usunięto: ${bookmarkCount} zakładek, ${folderCount} folderów.`);
    await refresh();
    await updateUndoState();
  } catch (error) {
    alert(`Nie udało się usunąć elementów: ${error?.message || error}`);
  }
}

function snapshotNode(node) {
  return {
    title: node.title || "",
    url: node.url || null,
    parentId: parentById.get(node.id) || null,
    index: node.index,
    children: (node.children || []).map(snapshotNode)
  };
}

async function undoLastDelete() {
  const { lastDeletedBatch } = await chrome.storage.local.get("lastDeletedBatch");
  if (!lastDeletedBatch?.items?.length) return;

  try {
    for (const item of lastDeletedBatch.items) {
      await restoreSnapshot(item);
    }
    await chrome.storage.local.remove("lastDeletedBatch");
    showNotice("Przywrócono ostatnio usunięte zakładki/foldery.");
    await refresh();
    await updateUndoState();
  } catch (error) {
    alert(`Nie udało się przywrócić wszystkiego: ${error?.message || error}`);
  }
}

async function restoreSnapshot(snapshot, forcedParentId = null) {
  let parentId = forcedParentId || snapshot.parentId;

  if (!parentId || !nodeById.has(parentId)) {
    const root = roots[0];
    parentId = root?.children?.[0]?.id || "1";
  }

  const createDetails = {
    parentId,
    title: snapshot.title
  };

  if (snapshot.url) createDetails.url = snapshot.url;
  if (Number.isInteger(snapshot.index)) createDetails.index = snapshot.index;

  const created = await chrome.bookmarks.create(createDetails);

  if (!snapshot.url) {
    for (const child of snapshot.children || []) {
      await restoreSnapshot(child, created.id);
    }
  }

  return created;
}

async function updateUndoState() {
  const { lastDeletedBatch } = await chrome.storage.local.get("lastDeletedBatch");
  els.undo.disabled = !lastDeletedBatch?.items?.length;
}

function allNodes() {
  const result = [];

  const walk = node => {
    result.push(node);
    for (const child of node.children || []) walk(child);
  };

  for (const root of roots) walk(root);
  return result;
}

function isChromeRoot(node) {
  return node.id === "0" || node.parentId === "0" || parentById.get(node.id) === "0";
}

function countDescendantBookmarks(node) {
  let count = 0;

  const walk = n => {
    for (const child of n.children || []) {
      if (child.url) count++;
      else walk(child);
    }
  };

  walk(node);
  return count;
}

function countDescendantFolders(node) {
  let count = 0;

  const walk = n => {
    for (const child of n.children || []) {
      if (!child.url) {
        count++;
        walk(child);
      }
    }
  };

  walk(node);
  return count;
}

function showNotice(text) {
  els.notice.textContent = text;
  els.notice.classList.remove("hidden");
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => els.notice.classList.add("hidden"), 4200);
}
