import { useEffect, useState, useCallback } from 'react'
import type { WebSocketMessage } from '../models/entity/client/websocket'

export const useWebSocket = (url: string) => {
    const [ws, setWs] = useState<WebSocket | null>(null)
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // WebSocketインスタンスの作成
        const websocket = new WebSocket(url)

        // 接続が確立したとき
        websocket.onopen = () => {
            setConnected(true)
            setError(null)
        }

        // エラーが発生したとき
        websocket.onerror = () => {
            setError('WebSocket接続エラーが発生しました')
            setConnected(false)
        }

        // 接続が閉じたとき
        websocket.onclose = () => {
            setConnected(false)
            setError('WebSocket接続が切断されました')
        }

        // WebSocketインスタンスを状態にセット
        setWs(websocket)

        // クリーンアップ関数
        return () => {
            websocket.close()
        }
    }, [url])

    // 再接続機能
    const reconnect = useCallback(() => {
        if (ws) {
            ws.close()
        }
        const newWs = new WebSocket(url)
        setWs(newWs)
    }, [url, ws])

    // メッセージ送信のヘルパー関数
    const sendMessage = useCallback((data: WebSocketMessage) => {
        if (ws && connected) {
            ws.send(JSON.stringify(data))
        } else {
            setError('WebSocketが接続されていません')
        }
    }, [ws, connected])

    return {
        ws,         // WebSocketインスタンス
        connected,  // 接続状態
        error,      // エラー状態
        reconnect,  // 再接続関数
        sendMessage // メッセージ送信関数
    }
}