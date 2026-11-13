import { ChevronDownIcon, ChevronRightIcon, FolderOpenIcon, LayoutGridIcon, Maximize2Icon, Minimize2Icon, PlusIcon, ScanSearchIcon, SearchIcon, Settings2Icon, ShieldCheckIcon, CloudIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react"

import { BrandCloud } from "@/components/brand"
import { SettingsContext, ShellContext } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { api, type AuditSummary, type ProductSummary, type Settings } from "@/lib/api"
import { auditHref, productHref, useRoute, type Route } from "@/lib/route"
import { cn } from "@/lib/utils"
import { AuditPage, AuditsPage, NewAuditPage } from "@/pages/audits"
import { HomePage } from "@/pages/home"
import { NewProductPage } from "@/pages/new-product"
import { ProductPage } from "@/pages/product"
import { ProductsPage } from "@/pages/products"
import { SettingsPage } from "@/pages/settings"

function Sidebar({ route, settings, products, audits, onNavigate }: {
  route: Route; settings: Settings | null; products: ProductSummary[] | null
  audits: AuditSummary[] | null; onNavigate: () => void
}) {
  const [query, setQuery] = useState("")
  const [recentOpen, setRecentOpen] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // The mobile drawer is hidden; leave its search shortcut to the browser.
        if (!matchMedia("(min-width: 768px)").matches) return
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    addEventListener("keydown", focusSearch)
    return () => removeEventListener("keydown", focusSearch)
  }, [])
  const needle = query.trim().toLocaleLowerCase()
  const results = [
    ...(products ?? []).map((p) => ({ name: p.name, href: productHref(p.slug), kind: "产品", updated: p.updated, active: route.page === "product" && route.slug === p.slug })),
    ...(audits ?? []).map((a) => ({ name: a.name, href: auditHref(a.slug), kind: "检查", updated: a.updated, active: route.page === "audit" && route.slug === a.slug })),
  ].filter((item) => !needle || item.name.toLocaleLowerCase().includes(needle)).sort((a, b) => b.updated - a.updated)
  const nav: { href: string; label: string; icon: ComponentType<{ className?: string }>; tone: string; active: boolean; count?: number }[] = [
    { href: "#/", label: "灵感空间", icon: LayoutGridIcon, tone: "blue", active: route.page === "home" },
    { href: "#/products", label: "我的产品", icon: FolderOpenIcon, tone: "amber", active: route.page === "products" || route.page === "product", count: products?.length },
    { href: "#/audits/new", label: "检查项目", icon: ScanSearchIcon, tone: "blue", active: route.page === "audit-new" },
    { href: "#/audits", label: "检查记录", icon: ShieldCheckIcon, tone: "mint", active: route.page === "audits" || route.page === "audit", count: audits?.length },
    { href: "#/settings", label: "模型设置", icon: Settings2Icon, tone: "gray", active: route.page === "settings" },
  ]
  return (
    <div className="workshop-sidebar-inner">
      <div className="workshop-brand-row">
        <a href="#/" onClick={onNavigate} className="workshop-brand" aria-label="灵犀首页">
          <BrandCloud /><span className="brand-name">灵犀</span>
        </a>
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onNavigate} aria-label="关闭菜单"><XIcon /></Button>
      </div>
      <div className="workshop-search">
        <SearchIcon aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索工作空间" aria-label="搜索产品和检查记录" />
        {!query && <kbd aria-hidden="true">⌘ K</kbd>}
      </div>
      {!needle && <nav className="workshop-nav" aria-label="主导航">
        {nav.map(({ href, label, icon: Icon, tone, active, count }) => (
          <a href={href} key={href} onClick={onNavigate} className={cn("workshop-nav-item", active && "is-active")} aria-current={active ? "page" : undefined}>
            <span className={`workshop-nav-icon tone-${tone}`}><Icon /></span>
            <span>{label}</span>
            {Boolean(count) && <span className="workshop-nav-count">{count}</span>}
          </a>
        ))}
      </nav>}
      <div className="workshop-recents">
        <a href="#/new" className={cn("workshop-new-chat", route.page === "new" && "is-active")} onClick={onNavigate}>
          <span><PlusIcon /></span> 新的对话 <span className="new-chat-arrow">↗</span>
        </a>
        <button className="workshop-section-label" onClick={() => setRecentOpen(!recentOpen)} aria-expanded={recentOpen} aria-controls="recent-workspaces">
          {needle ? "搜索结果" : "最近的灵感"}<ChevronDownIcon className={recentOpen ? "" : "is-collapsed"} />
        </button>
        {(recentOpen || needle) && <div className="workshop-recent-list" id="recent-workspaces" aria-live="polite">
          {!products && !audits ? <p className="workshop-recent-empty">正在打开工作空间…</p> : results.length ? results.slice(0, needle ? undefined : 8).map((item) => (
            <a href={item.href} key={item.href} onClick={onNavigate} className={cn("workshop-recent-item", item.active && "is-active")} title={item.name}>
              <span className="recent-dot" /><span className="truncate">{item.name}</span>{needle && <small>{item.kind}</small>}
            </a>
          )) : <p className="workshop-recent-empty">{needle ? "没有找到相关项目" : "你的下一个好想法，从这里开始。"}</p>}
        </div>}
      </div>
      <div className="workshop-sidebar-footer">
        <a className="workshop-assistant" href="#/new" onClick={onNavigate}>
          <span className="assistant-avatar"><BrandCloud /><i /></span>
          <span><strong>灵犀</strong><small>你的 Agent 共创伙伴</small></span>
          <CloudIcon className="assistant-decoration" />
        </a>
        <a className="workshop-profile" href="#/settings" onClick={onNavigate}>
          <span className="profile-avatar">我</span>
          <span><strong>我的工作空间</strong><small><i className={settings?.configured ? "connected" : ""} />{settings?.mock ? "离线演示" : settings?.configured ? "模型已连接" : "连接模型，开启共创"}</small></span>
          <ChevronRightIcon />
        </a>
      </div>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [audits, setAudits] = useState<AuditSummary[] | null>(null)
  const [error, setError] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  // This intentionally light, warm, inspiration-led workspace does not follow OS dark mode.
  useEffect(() => { document.documentElement.classList.remove("dark") }, [])
  useEffect(() => {
    const desktop = matchMedia("(min-width: 768px)")
    const closeDrawer = () => { if (desktop.matches) setSidebarOpen(false) }
    desktop.addEventListener("change", closeDrawer)
    return () => desktop.removeEventListener("change", closeDrawer)
  }, [])
  const reload = useCallback(async () => {
    try { setSettings(await api.settings()); setError("") }
    catch (err) { setError((err as Error).message) }
  }, [])
  const reloadProducts = useCallback(async () => {
    try { setProducts((await api.products()).products) } catch { /* Retry on navigation. */ }
  }, [])
  const reloadAudits = useCallback(async () => {
    try { setAudits((await api.audits()).audits) } catch { /* Retry on navigation. */ }
  }, [])
  useEffect(() => { reload() }, [reload])
  const routeKey = route.page === "product" || route.page === "audit" ? `${route.page}:${route.slug}` : route.page
  useEffect(() => { reloadProducts(); reloadAudits(); setSidebarOpen(false) }, [reloadProducts, reloadAudits, routeKey])
  useEffect(() => {
    if (!sidebarOpen) return
    const previous = document.activeElement as HTMLElement | null
    const controls = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button,input') ?? []).filter((el) => el.offsetParent !== null)
    controls()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false)
      if (event.key === "Tab") {
        const list = controls(); const first = list[0]; const last = list.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    addEventListener("keydown", onKey)
    return () => { removeEventListener("keydown", onKey); previous?.focus() }
  }, [sidebarOpen])

  return (
    <TooltipProvider>
      <ShellContext.Provider value={{ products, reloadProducts, audits, reloadAudits, openSidebar: () => setSidebarOpen(true) }}>
        <div className={cn("workshop-stage", expanded && "is-expanded")}>
          <div className="workshop-window">
            <aside ref={sidebarRef} className={cn("workshop-sidebar", sidebarOpen && "is-open")} aria-label="工作空间导航">
              <Sidebar route={route} settings={settings} products={products} audits={audits} onNavigate={() => setSidebarOpen(false)} />
            </aside>
            {sidebarOpen && <button className="workshop-backdrop" aria-label="关闭导航菜单" onClick={() => setSidebarOpen(false)} tabIndex={-1} />}
            <main className={cn("workshop-main", route.page === "home" && "is-home")} inert={sidebarOpen || undefined}>
              {route.page === "home" && <button className="workshop-expand" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "还原窗口" : "展开工作区"} title={expanded ? "还原窗口" : "展开工作区"}>{expanded ? <Minimize2Icon /> : <Maximize2Icon />}</button>}
              {error && <div className="workshop-connection-error" role="alert"><p>暂时无法连接工作空间</p><small>{error}</small><Button variant="outline" onClick={reload}>重新连接</Button></div>}
              {!settings && !error && <div className="workshop-loading"><BrandCloud /><span>正在打开你的灵感空间…</span></div>}
              {settings && <SettingsContext.Provider value={{ settings, reload }}>
                {route.page === "home" && <HomePage />}
                {route.page === "products" && <ProductsPage />}
                {route.page === "new" && <NewProductPage />}
                {route.page === "settings" && <SettingsPage />}
                {route.page === "product" && <ProductPage slug={route.slug} tab={route.tab} />}
                {route.page === "audits" && <AuditsPage />}
                {route.page === "audit-new" && <NewAuditPage />}
                {route.page === "audit" && <AuditPage slug={route.slug} tab={route.tab} />}
              </SettingsContext.Provider>}
            </main>
          </div>
        </div>
      </ShellContext.Provider>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}
