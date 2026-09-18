import { definePlugin } from '@jaspers-ai/sdk'
import { positions } from './sources.ts'

export default definePlugin({ id: 'cftc', sources: { positions }, views: {} })
