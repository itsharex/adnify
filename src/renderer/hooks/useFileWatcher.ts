/**
 * 文件变化监听 Hook
 */
import { useEffect } from 'react'
import { useStore } from '@store'
import { api } from '@renderer/services/electronAPI'
import { getFileName, pathEquals } from '@shared/utils/pathUtils'
import { removeFileFromTypeService } from '@renderer/services/monacoTypeService'

export function useFileWatcher() {
  useEffect(() => {
    const unsubscribe = api.file.onChanged(async (event: { event: string; path: string }) => {
      const { openFiles, reloadFileFromDisk, markFileDeleted, markFileRestored } = useStore.getState()

      // 处理文件删除事件
      if (event.event === 'delete') {
        removeFileFromTypeService(event.path)
        
        // 如果文件已打开，标记为已删除
        const openFile = openFiles.find(f => pathEquals(f.path, event.path))
        if (openFile) {
          markFileDeleted(openFile.path)
        }
        return
      }

      // 处理文件创建事件 - 可能是之前删除的文件被恢复
      if (event.event === 'create') {
        const openFile = openFiles.find(f => pathEquals(f.path, event.path))
        if (openFile?.isDeleted) {
          // 文件被恢复，重新加载内容
          const newContent = await api.file.read(event.path)
          if (newContent !== null) {
            reloadFileFromDisk(openFile.path, newContent)
          } else {
            markFileRestored(openFile.path)
          }
        }
        return
      }

      if (event.event !== 'update') return

      const openFile = openFiles.find(f => pathEquals(f.path, event.path))

      if (!openFile) return

      const newContent = await api.file.read(event.path)
      if (newContent === null) return

      // 内容相同，不需要操作
      if (newContent === openFile.content) return

      if (openFile.isDirty) {
        // 文件有未保存更改，显示冲突提示
        const shouldReload = confirm(
          `文件 "${getFileName(event.path)}" 已被外部修改。\n\n是否重新加载？（本地更改将丢失）`
        )
        if (shouldReload) {
          reloadFileFromDisk(openFile.path, newContent)
        }
      } else {
        // 文件无更改，直接刷新
        reloadFileFromDisk(openFile.path, newContent)
      }
    })

    return unsubscribe
  }, [])
}
