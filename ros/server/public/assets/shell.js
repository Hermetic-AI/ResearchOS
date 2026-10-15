// ResearchOS v2 shared shell: unified left nav (全站统一壳) + small helpers.
// Each page renders <aside id="shell">, then calls Shell.render("starmap" | "chat" | ...).
const Shell = (() => {
  const icon = {
    starmap: '<circle cx="7" cy="7" r="2"/><circle cx="17" cy="5" r="1.6"/><circle cx="18" cy="15" r="2.2"/><circle cx="9" cy="17" r="1.5"/><path d="M8.7 8.3 16 14M8.5 6.2 15.5 5.4M17 13l.3-6M10.4 16.6 16 15.6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
    workbench: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="8" height="6" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1.5"/>',
    reading: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M8 7h7M8 11h5"/>',
    trace: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/><path d="M3.5 10h4M16.5 14h4"/>',
    library: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6.5A2.5 2.5 0 0 0 4 19.5z"/>',
    translate: '<path d="M4 5h7M7.5 5c0 4-2 7-4.5 8.5M5 9c1.5 2.5 4 4 6.5 4.5M13 20l4-9 4 9M14.6 16.5h4.8"/>',
    notebook: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    skills: '<path d="m12 2 2 5.5L20 6l-2.5 4.5L22 13l-5.5 1L15 19l-3-3.5L9 19l.5-5L4 13l4.5-2.5L6 6l6 1.5z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 2h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12"/>',
  }

  const GROUPS = [
    { label: "研究场", items: [
      ["starmap", "文献星图", "/"],
      ["chat", "对话", "/chat.html"],
      ["workbench", "课题组", "/workbench.html"],
      ["reading", "边注阅读器", "/reading.html"],
      ["trace", "研究溯源", "/trace.html"],
    ] },
    { label: "工作台", items: [
      ["library", "文献库", "/library.html"],
      ["translate", "翻译", "/translate.html"],
      ["notebook", "数据分析", "/notebook.html"],
      ["skills", "技能中心", "/skills.html"],
    ] },
    { label: "系统", items: [
      ["settings", "设置", "/settings.html"],
    ] },
  ]

  function itemHtml(active, [key, label, href], badge) {
    const isActive = key === active
    const cls = isActive
      ? "flex items-center gap-2.5 px-3 py-2 rounded-md bg-accent-soft text-accent font-serif"
      : "flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-paper text-ink-soft"
    const svg = `<svg class="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${icon[key]}</svg>`
    const b = badge ? `<span class="ml-auto text-[11px] text-ink-faint">${badge}</span>` : ""
    return `<a class="${cls}" href="${href}">${svg}${label}${b}</a>`
  }

  function render(active, badges = {}) {
    const el = document.getElementById("shell")
    if (!el) return
    el.className = "w-[224px] shrink-0 bg-card border-r hairline flex flex-col"
    const nav = GROUPS.map(g =>
      `<div class="px-3 pb-1.5 pt-1 text-[10.5px] text-ink-faint smallcaps font-semibold">${g.label}</div>` +
      g.items.map(it => itemHtml(active, it, badges[it[0]])).join("")
    ).join('<div class="h-3"></div>')
    el.innerHTML = `
      <div class="px-5 h-16 flex items-center gap-2.5 border-b hairline">
        <span class="font-serif text-[19px] tracking-wide">Research<span class="text-seal">OS</span></span>
        <span class="ml-auto w-2 h-2 rounded-full bg-seal" title="本地运行"></span>
      </div>
      <nav class="flex-1 py-4 px-3 space-y-0.5 text-[13.5px] overflow-y-auto">${nav}</nav>
      <div class="px-5 py-3 border-t hairline text-[11px] text-ink-faint font-serif">Vol. II · 自建运行时 · 2026-10</div>`
  }

  // Honest placeholder for pages whose backend isn't built yet (P2/P3.5).
  function comingSoon(el, title, note, plan) {
    el.innerHTML = `
      <div class="max-w-[560px] mx-auto mt-16 px-6">
        <div class="bg-card border hairline rounded-lg px-8 py-10 text-center">
          <div class="font-serif text-[18px]">${title}</div>
          <div class="mt-2 text-[12px] text-ink-faint smallcaps">后端在建 · Backend in progress</div>
          <p class="mt-5 text-[13.5px] text-ink-soft leading-relaxed text-left">${note}</p>
          <div class="mt-5 border-t hairline pt-4 text-left text-[12.5px] text-ink-soft">
            <div class="smallcaps text-[10.5px] font-semibold text-ink-faint mb-1.5">计划路线</div>
            <ul class="space-y-1 list-disc pl-5">${plan.map(p => `<li>${p}</li>`).join("")}</ul>
          </div>
          <a href="/chat.html" class="inline-block mt-6 h-9 px-4 rounded-md bg-accent text-white text-[13px] leading-9 hover:opacity-90">先到对话页使用已就绪的能力 →</a>
        </div>
      </div>`
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

  return { render, comingSoon, esc }
})()
window.Shell = Shell
