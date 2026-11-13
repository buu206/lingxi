import { ArrowRightIcon, ArrowUpIcon, FolderSearchIcon, Grid2X2Icon, Layers3Icon, CloudIcon, MenuIcon } from "lucide-react"
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { BrandCloud } from "@/components/brand"
import { useSettings, useShell } from "@/components/common"
import { Button } from "@/components/ui/button"
import { editIntakeDraft, getIntakeDraft, saveIntakeDraft } from "@/lib/intake-draft"

export function HomePage() {
  const { settings } = useSettings()
  const { openSidebar } = useShell()
  const [idea, setIdea] = useState(() => {
    const draft = getIntakeDraft()
    return draft?.status === "pending" ? draft.text : ""
  })
  const input = useRef<HTMLTextAreaElement>(null)
  const composing = useRef(false)
  const submitting = useRef(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (composing.current || submitting.current || !idea.trim()) return
    submitting.current = true
    saveIntakeDraft(idea)
    location.hash = "#/new"
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 选中文输入法候选词时不能发消息；Shift + Enter 保留换行。
    if (event.nativeEvent.isComposing || composing.current || event.nativeEvent.keyCode === 229) return
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!event.repeat) event.currentTarget.form?.requestSubmit()
    }
  }

  const suggest = (text: string) => {
    setIdea(text)
    editIntakeDraft(text)
    input.current?.focus()
    requestAnimationFrame(() => input.current?.setSelectionRange(text.length, text.length))
  }

  return (
    <div className="hero-page">
      <div className="hero-mobile-menu md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={openSidebar} aria-label="打开菜单">
          <MenuIcon />
        </Button>
      </div>

      <section className="hero-welcome" aria-labelledby="hero-title">
        <BrandCloud className="hero-cloud" />
        <div className="hero-heading">
          <p className="hero-eyebrow">让灵感，慢慢成形</p>
          <h1 id="hero-title">你好，我是<span>灵犀</span></h1>
          <p className="hero-description">从一个小小的想法，到真正可落地的 Agent。<br className="sm:hidden" />我们一起开始。</p>
        </div>

        <form className="hero-composer" onSubmit={submit} aria-label="开始一个新想法">
          <label className="sr-only" htmlFor="hero-idea">说说你想做的产品</label>
          <textarea
            ref={input}
            id="hero-idea"
            className="hero-input"
            rows={2}
            maxLength={6000}
            value={idea}
            onChange={(event) => { setIdea(event.target.value); editIntakeDraft(event.target.value) }}
            onKeyDown={onKeyDown}
            onCompositionStart={() => { composing.current = true }}
            onCompositionEnd={() => { composing.current = false }}
            placeholder="说说你的想法，或者一个想解决的小问题…"
            aria-describedby="hero-input-hint"
          />
          <div className="hero-composer-bottom">
            <span id="hero-input-hint" className="hero-input-hint"><CloudIcon aria-hidden="true" /> 一句话，也可以是一个好开始</span>
            <button className="hero-send" type="submit" disabled={!idea.trim()} aria-label="发送想法，开始对话" title="发送想法（Enter）">
              <ArrowUpIcon aria-hidden="true" />
            </button>
          </div>
        </form>

        <div className="hero-suggestions" aria-label="从这里开始">
          <button type="button" onClick={() => suggest("我想做一个 Agent，帮助 ")}><CloudIcon aria-hidden="true" /><span>做一个新 Agent</span></button>
          <button type="button" onClick={() => suggest("帮我梳理这个想法的 MVP，先确定第一版最值得做的功能：")}><Layers3Icon aria-hidden="true" /><span>梳理产品 MVP</span></button>
          <a href="#/audits/new"><FolderSearchIcon aria-hidden="true" /><span>检查已有项目</span></a>
          <a href="#/products"><Grid2X2Icon aria-hidden="true" /><span>查看我的产品</span></a>
        </div>

        {settings.mock ? (
          <p className="hero-mode-note">正在离线体验，回复和方案为演示内容。</p>
        ) : !settings.configured ? (
          <p className="hero-mode-note">
            先记下灵感，连接模型后就能开始。
            <a href="#/settings" onClick={() => { if (idea.trim()) saveIntakeDraft(idea) }}>连接模型 <ArrowRightIcon aria-hidden="true" /></a>
          </p>
        ) : (
          <p className="hero-mode-note">不必想得很完整，我们会一起把它想清楚。</p>
        )}
      </section>
      <p className="hero-footer">每一个值得做的产品，都始于一个小小的想法。</p>
    </div>
  )
}
