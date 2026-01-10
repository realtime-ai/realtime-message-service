import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Centrifuge,
  Subscription,
  PublicationContext,
  JoinContext,
  LeaveContext,
  PresenceResult,
} from 'centrifuge';
import { ChatMessage, PresenceInfo } from '../types';

const CENTRIFUGO_URL =
  import.meta.env.VITE_CENTRIFUGO_URL || 'ws://localhost:8000/connection/websocket';

interface UseCentrifugeOptions {
  token: string;
  userName: string;
}

interface UseCentrifugeReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  currentChannel: string | null;
  messages: ChatMessage[];
  users: PresenceInfo[];
  joinChannel: (channelName: string) => void;
  leaveChannel: () => void;
  sendMessage: (text: string) => Promise<void>;
}

export function useCentrifuge({ token, userName }: UseCentrifugeOptions): UseCentrifugeReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChannel, setCurrentChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<PresenceInfo[]>([]);

  const clientRef = useRef<Centrifuge | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);

  // Initialize Centrifuge client
  useEffect(() => {
    if (!token) return;

    const client = new Centrifuge(CENTRIFUGO_URL, {
      token,
      data: {
        userId: '', // Will be extracted from token by backend
        userName: userName,
      },
    });

    client.on('connected', () => {
      console.log('Connected to Centrifugo');
      setConnected(true);
      setConnecting(false);
      setError(null);
    });

    client.on('connecting', () => {
      console.log('Connecting to Centrifugo...');
      setConnecting(true);
    });

    client.on('disconnected', (ctx) => {
      console.log('Disconnected from Centrifugo:', ctx);
      setConnected(false);
      setConnecting(false);
    });

    client.on('error', (ctx) => {
      console.error('Centrifugo error:', ctx);
      setError(ctx.error?.message || 'Connection error');
    });

    client.connect();
    clientRef.current = client;

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [token, userName]);

  // Join a channel
  const joinChannel = useCallback(
    (channelName: string) => {
      const client = clientRef.current;
      if (!client || !connected) {
        setError('Not connected to server');
        return;
      }

      // Leave current channel if any
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }

      // Reset state
      setMessages([]);
      setUsers([]);
      setError(null);

      const fullChannelName = `chat:${channelName}`;
      const sub = client.newSubscription(fullChannelName);

      sub.on('subscribed', async (ctx) => {
        console.log('Subscribed to channel:', fullChannelName, ctx);
        setCurrentChannel(channelName);

        // Get presence (online users)
        try {
          const presence: PresenceResult = await sub.presence();
          const userList = Object.values(presence.clients) as PresenceInfo[];
          setUsers(userList);
        } catch (err) {
          console.error('Failed to get presence:', err);
        }

        // Get history
        try {
          const history = await sub.history({ limit: 50 });
          const historyMessages = history.publications
            .map((pub) => pub.data as ChatMessage)
            .filter((msg) => msg && msg.id);
          setMessages(historyMessages);
        } catch (err) {
          console.error('Failed to get history:', err);
        }
      });

      sub.on('publication', (ctx: PublicationContext) => {
        console.log('New message:', ctx.data);
        const message = ctx.data as ChatMessage;
        if (message && message.id) {
          setMessages((prev) => [...prev, message]);
        }
      });

      sub.on('join', (ctx: JoinContext) => {
        console.log('User joined:', ctx.info);
        const info = ctx.info as PresenceInfo;
        setUsers((prev) => {
          // Avoid duplicates
          if (prev.some((u) => u.client === info.client)) {
            return prev;
          }
          return [...prev, info];
        });
      });

      sub.on('leave', (ctx: LeaveContext) => {
        console.log('User left:', ctx.info);
        const info = ctx.info as PresenceInfo;
        setUsers((prev) => prev.filter((u) => u.client !== info.client));
      });

      sub.on('error', (ctx) => {
        console.error('Subscription error:', ctx);
        setError(ctx.error?.message || 'Subscription error');
      });

      sub.on('unsubscribed', () => {
        console.log('Unsubscribed from channel');
      });

      sub.subscribe();
      subscriptionRef.current = sub;
    },
    [connected]
  );

  // Leave current channel
  const leaveChannel = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    setCurrentChannel(null);
    setMessages([]);
    setUsers([]);
  }, []);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    const sub = subscriptionRef.current;
    if (!sub) {
      throw new Error('Not subscribed to any channel');
    }

    await sub.publish({ text });
  }, []);

  return {
    connected,
    connecting,
    error,
    currentChannel,
    messages,
    users,
    joinChannel,
    leaveChannel,
    sendMessage,
  };
}
