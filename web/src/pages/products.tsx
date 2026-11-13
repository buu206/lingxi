import { ArrowUpRightIcon, Clock3Icon, FolderOpenIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Chip, Screen, ScrollBody, TopBar, timeAgo, useShell } from "@/components/common"
import { Button } from "@/components/ui/button"
import type { ProductSummary } from "@/lib/api"
import { productHref } from "@/lib/route"
import { cn } from "@/lib/utils"

type Filter = "all" | "pending" | "planned"

const FILTERS: { key: Filter; label: string; match: (product: ProductSummary) => boolean }[] = [
  { key: "all", label: "全部产品", match: () => true },
  { key: "pending", label: "待完善", match: (product) => !product.has_plan || product.unknowns > 0 },
  { key: "planned", label: "已有方案", match: (product) => product.has_plan },
]

function ProductCard({ product }: { product: ProductSummary }) {
  const description = !product.has_plan
    ? "需求已经记下，下一步一起推导产品方案。"
    : product.unknowns > 0
      ? `还有 ${product.unknowns} 个问题待确认，让你的想法再清晰一点。`
      : "方案已生成，看看架构、试玩体验，或开始下一轮迭代。"

  return (
    <a className="products-card group" href={productHref(product.slug)}>
      <div className="products-card-top flex items-start justify-between gap-3">
        <span className="products-card-icon" aria-hidden="true"><FolderOpenIcon size={22} strokeWidth={1.5} /></span>
        <span className="products-card-version">V{product.version}</span>
      </div>
      <h2 className="products-card-title break-words">{product.name}</h2>
      <p className="products-card-description">{description}</p>
      <div className="products-card-status">
        {!product.has_plan ? (
          <Chip>等待推导</Chip>
        ) : product.unknowns > 0 ? (
          <Chip tone="ask">{product.unknowns} 个待确认问题</Chip>
        ) : (
          <Chip tone="ok">方案已生成</Chip>
        )}
      </div>
      <div className="products-card-footer flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5"><Clock3Icon size={13} aria-hidden="true" />{timeAgo(product.updated)}更新</span>
        <ArrowUpRightIcon className="products-card-arrow" size={18} aria-hidden="true" />
      </div>
    </a>
  )
}

export function ProductsPage() {
  const { products } = useShell()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const normalized = query.trim().toLocaleLowerCase()
  const visible = useMemo(() => {
    const active = FILTERS.find((item) => item.key === filter)!
    return (products ?? []).filter((product) => active.match(product) && product.name.toLocaleLowerCase().includes(normalized))
  }, [products, filter, normalized])

  return (
    <Screen>
      <TopBar title="我的产品" />
      <ScrollBody className="workshop-products">
        <div className="products-heading flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="products-eyebrow">YOUR IDEAS, TAKING SHAPE</p>
            <h1>每个想法，都在这里生长。</h1>
            <p className="products-subtitle">从第一份需求，到下一次迭代，接着上次的灵感继续。</p>
          </div>
          <Button className="products-create-button" nativeButton={false} render={<a href="#/new" />}>
            <PlusIcon /> 新建产品
          </Button>
        </div>

        <div className="products-toolbar flex flex-wrap items-center justify-between gap-4">
          <div className="products-filters flex flex-wrap gap-1" role="group" aria-label="筛选产品状态">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={cn("products-filter", filter === item.key && "is-active")}
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                {products && <span className="products-filter-count">{products.filter(item.match).length}</span>}
              </button>
            ))}
          </div>
          <div className="products-search flex items-center gap-2">
            <SearchIcon size={16} aria-hidden="true" />
            <input
              aria-label="按产品名称搜索"
              type="search"
              placeholder="搜索你的产品…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && <button type="button" aria-label="清空产品搜索" onClick={() => setQuery("")}><XIcon size={14} /></button>}
          </div>
        </div>

        {!products ? (
          <div className="products-empty" role="status">正在打开你的产品空间…</div>
        ) : products.length === 0 ? (
          <div className="products-empty">
            <span className="products-empty-icon"><FolderOpenIcon size={30} strokeWidth={1.3} aria-hidden="true" /></span>
            <h2>给第一个想法，留一个位置。</h2>
            <p>不用完整的计划。从一句「我想做……」开始就好。</p>
            <Button nativeButton={false} render={<a href="#/new" />}><PlusIcon /> 开始第一个产品</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="products-empty" role="status">
            <SearchIcon size={28} strokeWidth={1.5} aria-hidden="true" />
            <h2>没有找到符合条件的产品</h2>
            <p>{normalized ? "试试其他名称，或换一个筛选条件。" : "这里暂时没有产品，换一个状态看看。"}</p>
            <Button variant="outline" onClick={() => { setQuery(""); setFilter("all") }}>查看全部产品</Button>
          </div>
        ) : (
          <div className="products-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((product) => <ProductCard key={product.slug} product={product} />)}
            {filter === "all" && !normalized && (
              <a href="#/new" className="products-new-card flex flex-col items-center justify-center gap-3">
                <span className="products-new-icon"><PlusIcon size={24} strokeWidth={1.5} /></span>
                <span>下一个想法，从这里开始</span>
              </a>
            )}
          </div>
        )}
      </ScrollBody>
    </Screen>
  )
}
