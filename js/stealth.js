(function() {
  "use strict";

  const LOWER = "abcdefghijklmnopqrstuvwxyz";
  const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const MATH_LOWER = [0x1d41a,0x1d44e,0x1d482,0x1d5ba,0x1d5ee,0x1d622,0x1d656,0x1d68a];
  const MATH_UPPER = [0x1d400,0x1d434,0x1d468,0x1d5a0,0x1d5d4,0x1d608,0x1d63c,0x1d670];
  const MATH_DIGIT = [0x1d7ce,0x1d7d8,0x1d7e2,0x1d7ec,0x1d7f6];
  const CROSS = {
    a:[0x430],c:[0x441,0x3f2],d:[0x501],e:[0x435],g:[0x261],h:[0x4bb],i:[0x456,0x131],j:[0x458],l:[0x4cf],o:[0x43e,0x3bf,0x585],p:[0x440,0x3c1],s:[0x455],u:[0x57d],v:[0x3bd,0x475],w:[0x51d],x:[0x445],y:[0x443,0x3b3],
    A:[0x410,0x391],B:[0x412,0x392],C:[0x421,0x3f9],E:[0x415,0x395],H:[0x41d,0x397],I:[0x406,0x399],J:[0x408],K:[0x41a,0x39a],M:[0x41c,0x39c],N:[0x39d],O:[0x41e,0x39f,0x555],P:[0x420,0x3a1],S:[0x405],T:[0x422,0x3a4],X:[0x425,0x3a7],Y:[0x423,0x3a5],Z:[0x396]
  };

  const POOL = Object.create(null);
  const add = (ch, cp) => (POOL[ch] || (POOL[ch] = [])).push(typeof cp === "number" ? String.fromCodePoint(cp) : cp);
  for (let i = 0; i < 26; i++) {
    for (const b of MATH_LOWER) add(LOWER[i], b + i);
    for (const b of MATH_UPPER) add(UPPER[i], b + i);
  }
  for (let i = 0; i < 10; i++) for (const b of MATH_DIGIT) add(String(i), b + i);
  for (const ch in CROSS) for (const cp of CROSS[ch]) add(ch, cp);

  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const stableCache = new Map();
  const STABLE_MAX = 500;
  const originals = new Map();
  const SKIP = { SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, NOSCRIPT:1, CODE:1, PRE:1 };
  let observer = null;
  let active = false;
  let currentLevel = 0;

  function getStoredLevel() {
    try {
      const value = localStorage.getItem("endis_stealthLevel");
      if (value !== null) return Math.max(0, Math.min(4, Number(value) || 0));
    } catch {}
    return 4;
  }

  function setStoredLevel(level) {
    try { localStorage.setItem("endis_stealthLevel", String(level)); } catch {}
  }

  function homoglyph(str) {
    let out = "";
    for (const ch of String(str == null ? "" : str)) {
      const pool = POOL[ch];
      out += pool ? pick(pool) : ch;
    }
    return out;
  }

  function homoglyphStable(str) {
    const s = String(str == null ? "" : str);
    let value = stableCache.get(s);
    if (value === undefined) {
      value = homoglyph(s);
      if (stableCache.size >= STABLE_MAX) stableCache.delete(stableCache.keys().next().value);
      stableCache.set(s, value);
    }
    return value;
  }

  function shouldSkip(node) {
    const parent = node.parentNode;
    if (!parent || parent.nodeType !== 1) return true;
    if (SKIP[parent.nodeName]) return true;
    if (parent.closest && parent.closest("[data-no-obf]")) return true;
    if (parent.isContentEditable) return true;
    return !node.nodeValue || !node.nodeValue.trim();
  }

  function transformNode(node) {
    if (shouldSkip(node)) return;
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    node.nodeValue = currentLevel > 0 ? homoglyphStable(originals.get(node)) : originals.get(node);
  }

  function walk(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(transformNode);
  }

  function forget(root) {
    if (root.nodeType === 3) {
      originals.delete(root);
      return;
    }
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) originals.delete(node);
  }

  function processAll() {
    if (document.body) walk(document.body);
  }

  function applyObfuscation(enabled) {
    enabled = !!enabled;
    if (enabled === active) return;
    active = enabled;
    currentLevel = enabled ? Math.max(1, getStoredLevel()) : 0;
    if (enabled) {
      stableCache.clear();
      processAll();
      observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 3) transformNode(node);
              else if (node.nodeType === 1) walk(node);
            });
            mutation.removedNodes.forEach(forget);
          } else if (mutation.type === "characterData" && !originals.has(mutation.target)) {
            transformNode(mutation.target);
          }
        }
      });
      observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    } else {
      if (observer) observer.disconnect();
      observer = null;
      for (const [node, original] of originals) {
        try { node.nodeValue = original; } catch {}
      }
      originals.clear();
      stableCache.clear();
    }
  }

  function setLevel(level) {
    level = Math.max(0, Math.min(4, Number(level) || 0));
    setStoredLevel(level);
    if (level === 0) {
      applyObfuscation(false);
      return;
    }
    if (!active) {
      active = false;
      applyObfuscation(true);
    } else {
      currentLevel = level;
      stableCache.clear();
      processAll();
    }
  }

  function init() {
    const level = getStoredLevel();
    currentLevel = level;
    active = level > 0;
    if (active && document.body) {
      processAll();
      observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 3) transformNode(node);
              else if (node.nodeType === 1) walk(node);
            });
            mutation.removedNodes.forEach(forget);
          } else if (mutation.type === "characterData" && !originals.has(mutation.target)) {
            transformNode(mutation.target);
          }
        }
      });
      observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    }
  }

  window.Stealth = {
    getLevel: () => currentLevel,
    setLevel,
    refresh: processAll,
    isActive: () => active,
    homoglyph,
    homoglyphStable,
    applyObfuscation
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
