'use client';

import { Message } from 'ably';
import { ChannelProvider, useChannel, useConnectionStateListener } from 'ably/react';
import { useEffect, useRef, useState } from 'react';

export default function Page() {
  return (
    <div className="w-full h-full overflow-auto">
      <ChannelProvider channelName="register-customer">
        <AblyPubSub />
      </ChannelProvider>
      <ChannelProvider channelName="logs">
        <LiveLogViewer />
      </ChannelProvider>
    </div>
  );
}

type LogEntry = {
  id: string;
  timestamp: string;
  level: string;
  args: string[];
  sessionId?: string;
};

function LogRow({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const extraArgsCount = log.args.length - 1;

  return (
    <div>
      <span style={{ color: '#888' }}>[{log.timestamp}]</span>{' '}
      <span style={{ color: getLevelColor(log.level) }}>{log.level.toUpperCase()}</span>{' '}
      {log.args.length > 0 && <span>{log.args[0]}</span>}
      {extraArgsCount > 0 && (
        <>
          {!expanded ? (
            <button
              onClick={() => setExpanded(true)}
              style={{
                marginLeft: '0.5rem',
                background: 'none',
                border: 'none',
                color: '#0ff',
                cursor: 'pointer',
                fontFamily: 'monospace',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Ver más ({extraArgsCount})
            </button>
          ) : (
            <>
              <span> {log.args.slice(1).join(' ')}</span>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  marginLeft: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: '#0ff',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Ver menos
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

const LiveLogViewer = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [filterSessionId, setFilterSessionId] = useState<string | 'ALL'>('ALL');
  const [knownSessions, setKnownSessions] = useState<string[]>([]);

  const handleLog = (message: Message) => {
    const data = message.data as {
      sessionId?: string;
      level: string;
      args: string[];
      timestamp: string;
    };

    setLogs((prev) => [
      ...prev,
      {
        id: message.id || crypto.randomUUID(),
        level: data.level,
        args: data.args,
        timestamp: data.timestamp,
        sessionId: data.sessionId,
      },
    ]);
  };

  useChannel('logs', 'log', handleLog);
  useChannel('logs', 'info', handleLog);
  useChannel('logs', 'warn', handleLog);
  useChannel('logs', 'error', handleLog);

  const visibleLogs = filterSessionId === 'ALL' ? logs : logs.filter((l) => l.sessionId === filterSessionId);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleLogs.length]);

  useEffect(() => {
    const sessions = Array.from(
      new Set([...logs.map((l) => l.sessionId), filterSessionId].filter(Boolean) as string[])
    );
    setKnownSessions(sessions);
  }, [logs, filterSessionId]);

  return (
    <div
      style={{
        backgroundColor: '#111',
        color: '#0f0',
        fontFamily: 'monospace',
        height: '300px',
        overflowY: 'auto',
        border: '1px solid #444',
        borderRadius: '8px',
      }}
    >
      <div
        style={{
          marginBottom: '0.5rem',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'darkslategrey',
          padding: 4,
        }}
      >
        <label style={{ color: '#888', fontSize: '0.85rem' }}>Filter session:</label>
        <select value={filterSessionId} onChange={(e) => setFilterSessionId(e.target.value as string | 'ALL')}>
          <option value="ALL">All sessions</option>
          {knownSessions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (filterSessionId === 'ALL') {
              setLogs([]);
            } else {
              setLogs((prev) => prev.filter((l) => l.sessionId !== filterSessionId));
            }
          }}
          style={{
            marginLeft: 'auto',
            backgroundColor: '#333',
            color: '#f55',
            border: '1px solid #f55',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: '0.8rem',
          }}
        >
          Clear
        </button>
      </div>
      {visibleLogs.map((log) => (
        <LogRow key={log.id} log={log} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

function getLevelColor(level: string): string {
  switch (level) {
    case 'error':
      return '#f55';
    case 'warn':
      return '#ff5';
    case 'info':
      return '#0ff';
    case 'log':
      return '#0f0';
    default:
      return '#fff';
  }
}

function AblyPubSub() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  useConnectionStateListener('connected', () => {
    console.log('Connected to Ably!');
  });

  useChannel('register-customer', 'start', (message) => {
    setMessages((previousMessages) => [...previousMessages, message]);
  });

  return (
    <div style={{ padding: '1rem', backgroundColor: '#222', color: '#fff', borderRadius: '8px' }}>
      {messages.length === 0 ? (
        <p style={{ color: '#888' }}>No messages received yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {messages.map((message) => (
            <li
              key={message.id}
              onClick={() => setSelectedMessage(message)}
              style={{
                marginBottom: '0.5rem',
                padding: '0.5rem',
                backgroundColor: '#333',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              <strong>session id:</strong> {message.data?.sessionId || message.id}
            </li>
          ))}
        </ul>
      )}
      {selectedMessage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSelectedMessage(null)}
        >
          <div
            style={{
              backgroundColor: '#222',
              color: '#fff',
              padding: '1rem',
              borderRadius: '8px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflowY: 'auto',
              fontFamily: 'monospace',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Message ID: {selectedMessage.id}</h3>
            <p>
              <strong>Event:</strong> {selectedMessage.name}
            </p>
            <p>
              <strong>Data:</strong>
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {typeof selectedMessage.data === 'object'
                ? JSON.stringify(selectedMessage.data, null, 2)
                : selectedMessage.data}
            </pre>
            <button
              onClick={() => setSelectedMessage(null)}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#0f0',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
