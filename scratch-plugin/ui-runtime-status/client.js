/** Browser cards for the tutorial's runtime inspection tools. */
window.__ModuleLoader__.load({
  id: '@tutorial/runtime-status-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'tutorialRuntimeStatus'

    const dictionaries = {
      zh: {
        currentTitle: '当前项目', systemTitle: '系统状态', running: '正在读取', failed: '读取失败',
        cwd: '工作目录', platform: '运行平台', node: 'Node.js', cpu: '可用 CPU', memory: '内存使用',
        systemUptime: '系统运行时间', processUptime: '进程运行时间', processMemory: '进程内存', inspect: '查看轨迹',
      },
      en: {
        currentTitle: 'Current project', systemTitle: 'System status', running: 'Reading', failed: 'Failed',
        cwd: 'Working directory', platform: 'Platform', node: 'Node.js', cpu: 'Available CPUs', memory: 'Memory usage',
        systemUptime: 'System uptime', processUptime: 'Process uptime', processMemory: 'Process memory', inspect: 'Inspect',
      },
    }

    const css = `
      .tutorial-runtime-card{margin:5px 0 7px 4px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:linear-gradient(145deg,var(--dsw-alias-bg-base),var(--dsw-alias-markdown-code-block));box-shadow:0 8px 28px color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
      .tutorial-runtime-head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
      .tutorial-runtime-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:color-mix(in srgb,#4d6bfe 16%,var(--dsw-alias-bg-base));color:#4d6bfe;font-size:10px;font-weight:700;letter-spacing:.04em}
      .tutorial-runtime-heading{min-width:0;flex:1}.tutorial-runtime-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
      .tutorial-runtime-subtitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-caption)}
      .tutorial-runtime-state{padding:2px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover-solid);font-size:10px;color:var(--dsw-alias-label-tertiary)}
      .tutorial-runtime-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px 12px 12px}
      .tutorial-runtime-cell{min-width:0;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 78%,transparent)}
      .tutorial-runtime-cell[data-wide]{grid-column:1/-1}.tutorial-runtime-label{font-size:10px;color:var(--dsw-alias-label-caption);text-transform:uppercase;letter-spacing:.045em}
      .tutorial-runtime-value{margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:560;color:var(--dsw-alias-label-primary)}
      .tutorial-runtime-value code{font:var(--dsw-font-markdown-code-block-small);color:inherit}.tutorial-runtime-meter{height:5px;margin-top:8px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-border-l2)}
      .tutorial-runtime-meter>span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#4d6bfe,#8b5cf6)}
      .tutorial-runtime-error{padding:12px;color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap}.tutorial-runtime-inspect{margin:0 12px 10px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:10px;cursor:pointer}
      @media(max-width:520px){.tutorial-runtime-grid{grid-template-columns:1fr}.tutorial-runtime-cell[data-wide]{grid-column:auto}}
    `

    function objectMeta(block) {
      if (!('kind' in block) || block.isError || typeof block.meta !== 'object' || block.meta === null || Array.isArray(block.meta)) return null
      return block.meta
    }

    function resultText(block) {
      if (!('kind' in block)) return ''
      return block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item)).join('\n')
    }

    function bytes(value) {
      return `${(value / 1024 ** 3).toFixed(2)} GiB`
    }

    function duration(value) {
      const seconds = Math.max(0, Math.floor(value))
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    }

    function cell(label, value, wide = false, child) {
      return h('div', { className: 'tutorial-runtime-cell', 'data-wide': wide || undefined, key: label },
        h('div', { className: 'tutorial-runtime-label' }, label),
        h('div', { className: 'tutorial-runtime-value' }, value),
        child,
      )
    }

    function currentCells(meta, t) {
      if (typeof meta.cwd !== 'string' || typeof meta.platform !== 'string' || typeof meta.nodeVersion !== 'string') return null
      return [
        cell(t('cwd'), h('code', null, meta.cwd), true),
        cell(t('platform'), meta.platform),
        cell(t('node'), meta.nodeVersion),
      ]
    }

    function systemCells(meta, t) {
      const strings = ['platform', 'architecture', 'osRelease']
      const numbers = ['cpuCount', 'systemUptimeSeconds', 'totalMemoryBytes', 'freeMemoryBytes', 'processUptimeSeconds', 'processRssBytes']
      if (!strings.every(key => typeof meta[key] === 'string') || !numbers.every(key => typeof meta[key] === 'number')) return null
      const used = Math.max(0, meta.totalMemoryBytes - meta.freeMemoryBytes)
      const usedPercent = meta.totalMemoryBytes > 0 ? Math.min(100, used / meta.totalMemoryBytes * 100) : 0
      return [
        cell(t('platform'), `${meta.platform} ${meta.architecture}`, true),
        cell(t('cpu'), String(meta.cpuCount)),
        cell(t('systemUptime'), duration(meta.systemUptimeSeconds)),
        cell(t('memory'), `${bytes(used)} / ${bytes(meta.totalMemoryBytes)}`, true,
          h('div', { className: 'tutorial-runtime-meter', 'aria-hidden': true }, h('span', { style: { width: `${usedPercent.toFixed(1)}%` } }))),
        cell(t('processUptime'), duration(meta.processUptimeSeconds)),
        cell(t('processMemory'), bytes(meta.processRssBytes)),
      ]
    }

    function RuntimeCard({ block, toolName, inspect, t }) {
      const system = toolName === 'system_status'
      const title = t(system ? 'systemTitle' : 'currentTitle')
      const settled = 'kind' in block
      const meta = objectMeta(block)
      const cells = meta === null ? null : system ? systemCells(meta, t) : currentCells(meta, t)
      const error = settled && block.isError ? resultText(block) || t('failed') : null
      const subtitle = system && meta !== null && typeof meta.osRelease === 'string'
        ? meta.osRelease
        : !system && meta !== null && typeof meta.cwd === 'string' ? meta.cwd : t(settled ? 'failed' : 'running')
      return h('section', { className: 'tutorial-runtime-card', 'data-tool': toolName, 'aria-label': title },
        h('header', { className: 'tutorial-runtime-head' },
          h('span', { className: 'tutorial-runtime-mark', 'aria-hidden': true }, system ? 'SYS' : 'PWD'),
          h('span', { className: 'tutorial-runtime-heading' },
            h('div', { className: 'tutorial-runtime-title' }, title),
            h('div', { className: 'tutorial-runtime-subtitle' }, subtitle),
          ),
          !settled ? h('span', { className: 'tutorial-runtime-state' }, t('running')) : null,
        ),
        error !== null ? h('div', { className: 'tutorial-runtime-error' }, error)
          : cells !== null ? h('div', { className: 'tutorial-runtime-grid' }, cells) : null,
        inspect !== undefined ? h('button', { type: 'button', className: 'tutorial-runtime-inspect', onClick: inspect }, t('inspect')) : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'tutorial-runtime-status: dictionaries')
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = '@tutorial/runtime-status-ui'
          style.textContent = css
          document.head.append(style)
          return () => style.remove()
        }, 'tutorial-runtime-status: styles')
        ctx.slots.inject('tool.call.toolview', function* () {
          yield ctx.slots.register({ name: 'tool.call.toolview', key: 'current_project', locale: NS }, RuntimeCard)
          yield ctx.slots.register({ name: 'tool.call.toolview', key: 'system_status', locale: NS }, RuntimeCard)
        })
      },
    }
  },
})
