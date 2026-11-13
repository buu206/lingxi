import { useAui, useAuiState } from "@assistant-ui/react"
import { ArrowRightIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { BrandCloud } from "@/components/brand"
import { Thread } from "@/components/assistant-ui/elements/thread.aui"
import { ChatProvider } from "@/components/chat/chat-runtime"
import { useChatControls } from "@/components/chat/chat-storage"
import { RestartButton } from "@/components/chat/restart-button"
import { intakeToolkit } from "@/components/chat/tool-cards"
import { ModeCallouts, Screen, ScrollBody, TopBar, useSettings } from "@/components/common"
import { Button } from "@/components/ui/button"
import { chatEndpoints } from "@/lib/api"
import { claimIntakeDraft, getIntakeDraft } from "@/lib/intake-draft"

const STARTERS = [
  "家长拍一张玩具合影，AI 生成可以亲子一起演的剧情脚本",
  "每天早上整理我的邮箱，挑出要回复的，帮我起草回复",
  "帮小店老板回答顾客在微信上问的常见问题",
]

function Welcome() {
  return (
    <div className="workshop-chat-welcome">
      <BrandCloud className="workshop-chat-cloud" />
      <h1>让我们从一个想法开始</h1>
      <p>
        想帮谁，解决什么问题？不必一次想清楚。<br />我会陪你把灵感整理成一份可以开始的方案。
      </p>
    </div>
  )
}

/** 等 ChatProvider 恢复完历史后再发送，复用真实的 NDJSON 对话管线。 */
function SendHomeDraft({ draftId }: { draftId?: string }) {
  const aui = useAui()
  const ready = useAuiState((state) => !state.thread.isLoading && !state.thread.isDisabled && !state.thread.isRunning)

  useEffect(() => {
    if (!draftId || !ready) return
    const timeout = window.setTimeout(() => {
      const draft = claimIntakeDraft(draftId)
      if (draft) aui.thread().append(draft.text)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [aui, draftId, ready])

  return null
}

// 产品建好后对话就结束了；再往下聊不会改到已建的产品，所以把输入框换成「再建一个」
function Finished() {
  const { restart } = useChatControls()
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-2 text-sm text-muted-foreground">
      这个产品已经开始推导。
      <Button variant="outline" size="sm" onClick={restart}>
        再新建一个产品
      </Button>
    </div>
  )
}

export function NewProductPage() {
  const { settings } = useSettings()
  const [draft] = useState(getIntakeDraft)
  if (!settings.configured) {
    return (
      <Screen>
        <TopBar title="新建产品" />
        <ScrollBody className="max-w-2xl">
          <div className="workshop-connect-card">
            <BrandCloud className="workshop-chat-cloud" />
            <h1>{draft?.status === "pending" ? "你的想法，已经记下了" : "连接模型，让灵感继续"}</h1>
            <p>先在模型设置里连接你使用的服务，再回到这里开始对话。</p>
            {draft?.status === "pending" && <blockquote>{draft.text}</blockquote>}
            <Button nativeButton={false} render={<a href="#/settings" />}>前往模型设置 <ArrowRightIcon /></Button>
            <a className="workshop-connect-back" href="#/">返回首页</a>
          </div>
        </ScrollBody>
      </Screen>
    )
  }
  return (
    <Screen>
      <ChatProvider endpoint={chatEndpoints.intake} toolkit={intakeToolkit} starters={STARTERS} storageKey={draft ? `intake:${draft.id}` : "intake"}>
        <SendHomeDraft draftId={draft?.id} />
        <TopBar title="新建产品" actions={<RestartButton label="重新开始" />} />
        {settings.mock && (
          <div className="mx-auto w-full max-w-[44rem] px-4 pt-4">
            <ModeCallouts />
          </div>
        )}
        <div className="min-h-0 flex-1">
          <Thread components={{ Welcome, Finished }} placeholder="说说你的想法…" />
        </div>
      </ChatProvider>
    </Screen>
  )
}
