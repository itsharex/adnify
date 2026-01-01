/**
 * 将 ui-ux-pro-max-skill 的 CSV 数据转换为 JSON
 * 运行: node scripts/convert-uiux-data.js
 */

const fs = require('fs')
const path = require('path')

const SOURCE_DIR = path.join(__dirname, '../ui-ux-pro-max-skill-main/.claude/skills/ui-ux-pro-max/data')
const TARGET_DIR = path.join(__dirname, '../public/uiux/data')

// CSV 文件映射
const CSV_FILES = {
  'styles.csv': 'styles.json',
  'colors.csv': 'colors.json',
  'typography.csv': 'typography.json',
  'charts.csv': 'charts.json',
  'landing.csv': 'landing.json',
  'products.csv': 'products.json',
  'ux-guidelines.csv': 'ux-guidelines.json',
  'prompts.csv': 'prompts.json',
}

// 技术栈文件
const STACK_FILES = [
  'html-tailwind.csv',
  'react.csv',
  'nextjs.csv',
  'vue.csv',
  'svelte.csv',
  'swiftui.csv',
  'react-native.csv',
  'flutter.csv',
]

/**
 * 解析 CSV 行（处理引号内的逗号）
 */
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current.trim())
  return result
}

/**
 * 解析 CSV 文件
 */
function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) return []
  
  const headers = parseCSVLine(lines[0])
  const data = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row = {}
    
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || ''
    }
    
    data.push(row)
  }
  
  return data
}

/**
 * 转换单个文件
 */
function convertFile(sourcePath, targetPath) {
  try {
    const content = fs.readFileSync(sourcePath, 'utf-8')
    const data = parseCSV(content)
    
    // 确保目标目录存在
    const targetDir = path.dirname(targetPath)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2))
    console.log(`✓ Converted: ${path.basename(sourcePath)} -> ${path.basename(targetPath)} (${data.length} items)`)
    return true
  } catch (error) {
    console.error(`✗ Failed: ${path.basename(sourcePath)} - ${error.message}`)
    return false
  }
}

/**
 * 主函数
 */
function main() {
  console.log('Converting UI/UX data from CSV to JSON...\n')
  
  let success = 0
  let failed = 0
  
  // 转换主数据文件
  for (const [csvFile, jsonFile] of Object.entries(CSV_FILES)) {
    const sourcePath = path.join(SOURCE_DIR, csvFile)
    const targetPath = path.join(TARGET_DIR, jsonFile)
    
    if (convertFile(sourcePath, targetPath)) {
      success++
    } else {
      failed++
    }
  }
  
  // 转换技术栈文件
  console.log('\nConverting stack files...')
  for (const csvFile of STACK_FILES) {
    const sourcePath = path.join(SOURCE_DIR, 'stacks', csvFile)
    const jsonFile = csvFile.replace('.csv', '.json')
    const targetPath = path.join(TARGET_DIR, 'stacks', jsonFile)
    
    if (convertFile(sourcePath, targetPath)) {
      success++
    } else {
      failed++
    }
  }
  
  console.log(`\nDone! Success: ${success}, Failed: ${failed}`)
}

main()
