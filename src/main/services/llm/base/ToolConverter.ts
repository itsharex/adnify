/**
 * 工具转换器 - 统一处理工具定义转换
 * 
 * 职责：
 * - 将应用层工具定义转换为 AI SDK Tool 格式
 * - JSON Schema 到 Zod Schema 转换
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolDefinition } from '@shared/types'

export class ToolConverter {
  /**
   * 转换工具定义为 AI SDK 格式
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convert(tools: ToolDefinition[]): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {}

    for (const t of tools) {
      const schema = this.jsonSchemaToZod(t.parameters)
      result[t.name] = tool({
        description: t.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameters: schema as any,
      } as any)
    }

    return result
  }

  /**
   * JSON Schema 到 Zod 转换
   */
  private jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
    const type = schema.type as string

    switch (type) {
      case 'object':
        return this.convertObjectSchema(schema)
      case 'array':
        return this.convertArraySchema(schema)
      case 'string':
        return this.convertStringSchema(schema)
      case 'number':
      case 'integer':
        return z.number()
      case 'boolean':
        return z.boolean()
      default:
        return z.unknown()
    }
  }

  /**
   * 转换对象 Schema
   */
  private convertObjectSchema(schema: Record<string, unknown>): z.ZodObject<any> {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
    const required = (schema.required as string[]) || []

    if (!properties) {
      return z.object({})
    }

    const shape: Record<string, z.ZodTypeAny> = {}

    for (const [key, prop] of Object.entries(properties)) {
      let fieldSchema = this.jsonSchemaToZod(prop)
      const description = prop.description as string | undefined

      if (description) {
        fieldSchema = fieldSchema.describe(description)
      }

      if (!required.includes(key)) {
        fieldSchema = fieldSchema.optional()
      }

      shape[key] = fieldSchema
    }

    return z.object(shape)
  }

  /**
   * 转换数组 Schema
   */
  private convertArraySchema(schema: Record<string, unknown>): z.ZodArray<any> {
    const items = schema.items as Record<string, unknown> | undefined
    
    if (items) {
      return z.array(this.jsonSchemaToZod(items))
    }
    
    return z.array(z.unknown())
  }

  /**
   * 转换字符串 Schema
   */
  private convertStringSchema(schema: Record<string, unknown>): z.ZodEnum<any> | z.ZodString {
    const enumValues = schema.enum as string[] | undefined
    
    if (enumValues && enumValues.length > 0) {
      return z.enum(enumValues as [string, ...string[]])
    }
    
    return z.string()
  }
}
