/**
 * UI/UX 数据库管理
 * 加载和管理 UI/UX 设计数据
 */

import { BM25Searcher } from './BM25Engine'
import {
  type UiuxDomain,
  type TechStack,
  type UiuxSearchResult,
  DOMAIN_CONFIGS,
  STACK_CONFIG,
  AVAILABLE_STACKS,
} from './types'

/** 数据文件映射 */
const DATA_FILES: Record<UiuxDomain, string> = {
  style: 'styles.json',
  prompt: 'prompts.json',
  color: 'colors.json',
  chart: 'charts.json',
  landing: 'landing.json',
  product: 'products.json',
  ux: 'ux-guidelines.json',
  typography: 'typography.json',
}

/** 域关键词映射（用于自动检测） */
const DOMAIN_KEYWORDS: Record<UiuxDomain, string[]> = {
  color: ['color', 'palette', 'hex', '#', 'rgb'],
  chart: ['chart', 'graph', 'visualization', 'trend', 'bar', 'pie', 'scatter', 'heatmap', 'funnel'],
  landing: ['landing', 'page', 'cta', 'conversion', 'hero', 'testimonial', 'pricing', 'section'],
  product: ['saas', 'ecommerce', 'e-commerce', 'fintech', 'healthcare', 'gaming', 'portfolio', 'crypto', 'dashboard'],
  prompt: ['prompt', 'css', 'implementation', 'variable', 'checklist', 'tailwind'],
  style: ['style', 'design', 'ui', 'minimalism', 'glassmorphism', 'neumorphism', 'brutalism', 'dark mode', 'flat', 'aurora'],
  ux: ['ux', 'usability', 'accessibility', 'wcag', 'touch', 'scroll', 'animation', 'keyboard', 'navigation', 'mobile'],
  typography: ['font', 'typography', 'heading', 'serif', 'sans'],
}

/**
 * UI/UX 数据库类
 */
class UiuxDatabase {
  private searchers = new Map<string, BM25Searcher<Record<string, unknown>>>()
  private dataCache = new Map<string, Record<string, unknown>[]>()
  private initialized = false

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // 数据路径将在运行时通过 Electron 获取
    // 这里只标记为已初始化，实际数据按需加载
    this.initialized = true
  }

  /**
   * 加载域数据
   */
  private async loadDomainData(domain: UiuxDomain): Promise<Record<string, unknown>[]> {
    const cacheKey = `domain:${domain}`
    
    if (this.dataCache.has(cacheKey)) {
      return this.dataCache.get(cacheKey)!
    }

    try {
      const fileName = DATA_FILES[domain]
      const data = await this.loadJsonFile(`data/${fileName}`)
      this.dataCache.set(cacheKey, data)
      return data
    } catch (error) {
      console.error(`[UiuxDatabase] Failed to load ${domain} data:`, error)
      return []
    }
  }

  /**
   * 加载技术栈数据
   */
  private async loadStackData(stack: TechStack): Promise<Record<string, unknown>[]> {
    const cacheKey = `stack:${stack}`
    
    if (this.dataCache.has(cacheKey)) {
      return this.dataCache.get(cacheKey)!
    }

    try {
      const data = await this.loadJsonFile(`data/stacks/${stack}.json`)
      this.dataCache.set(cacheKey, data)
      return data
    } catch (error) {
      console.error(`[UiuxDatabase] Failed to load ${stack} stack data:`, error)
      return []
    }
  }

  /**
   * 加载 JSON 文件
   */
  private async loadJsonFile(relativePath: string): Promise<Record<string, unknown>[]> {
    try {
      const result = await window.electronAPI.resourcesReadJson<Record<string, unknown>[]>(`uiux/${relativePath}`)
      if (result.success && result.data) {
        return result.data
      }
      console.error(`[UiuxDatabase] Failed to load ${relativePath}:`, result.error)
      return []
    } catch (error) {
      console.error(`[UiuxDatabase] Failed to load ${relativePath}:`, error)
      return []
    }
  }

  /**
   * 获取或创建搜索器
   */
  private async getSearcher(key: string, data: Record<string, unknown>[], searchFields: string[]): Promise<BM25Searcher<Record<string, unknown>>> {
    if (!this.searchers.has(key)) {
      const searcher = new BM25Searcher<Record<string, unknown>>()
      searcher.initialize(data, searchFields)
      this.searchers.set(key, searcher)
    }
    return this.searchers.get(key)!
  }

  /**
   * 自动检测查询的最佳域
   */
  detectDomain(query: string): UiuxDomain {
    const queryLower = query.toLowerCase()
    
    const scores: Record<string, number> = {
      style: 0,
      color: 0,
      typography: 0,
      chart: 0,
      landing: 0,
      product: 0,
      ux: 0,
      prompt: 0,
    }

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      scores[domain] = keywords.filter(kw => queryLower.includes(kw)).length
    }

    const best = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)
    return best[1] > 0 ? best[0] as UiuxDomain : 'style'
  }

  /**
   * 搜索域数据
   */
  async search(query: string, domain?: UiuxDomain, maxResults = 3): Promise<UiuxSearchResult> {
    const targetDomain = domain || this.detectDomain(query)
    const config = DOMAIN_CONFIGS[targetDomain]
    
    const data = await this.loadDomainData(targetDomain)
    if (data.length === 0) {
      return {
        domain: targetDomain,
        query,
        count: 0,
        results: [],
      }
    }

    const searcher = await this.getSearcher(`domain:${targetDomain}`, data, config.searchFields)
    const results = searcher.search(query, maxResults)

    // 只返回输出字段
    const filteredResults = results.map(r => {
      const filtered: Record<string, unknown> = {}
      for (const field of config.outputFields) {
        if (field in r.item) {
          filtered[field] = r.item[field]
        }
      }
      return filtered
    })

    return {
      domain: targetDomain,
      query,
      count: filteredResults.length,
      results: filteredResults,
    }
  }

  /**
   * 搜索技术栈指南
   */
  async searchStack(query: string, stack: TechStack, maxResults = 3): Promise<UiuxSearchResult> {
    if (!AVAILABLE_STACKS.includes(stack)) {
      return {
        domain: 'stack',
        stack,
        query,
        count: 0,
        results: [],
      }
    }

    const data = await this.loadStackData(stack)
    if (data.length === 0) {
      return {
        domain: 'stack',
        stack,
        query,
        count: 0,
        results: [],
      }
    }

    const searcher = await this.getSearcher(`stack:${stack}`, data, STACK_CONFIG.searchFields)
    const results = searcher.search(query, maxResults)

    // 只返回输出字段
    const filteredResults = results.map(r => {
      const filtered: Record<string, unknown> = {}
      for (const field of STACK_CONFIG.outputFields) {
        if (field in r.item) {
          filtered[field] = r.item[field]
        }
      }
      return filtered
    })

    return {
      domain: 'stack',
      stack,
      query,
      count: filteredResults.length,
      results: filteredResults,
    }
  }

  /**
   * 获取可用域列表
   */
  getAvailableDomains(): UiuxDomain[] {
    return Object.keys(DOMAIN_CONFIGS) as UiuxDomain[]
  }

  /**
   * 获取可用技术栈列表
   */
  getAvailableStacks(): TechStack[] {
    return AVAILABLE_STACKS
  }
}

/** 单例实例 */
export const uiuxDatabase = new UiuxDatabase()
