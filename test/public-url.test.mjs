import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publicBaseUrl } from '../lib/public-url.mjs';

describe('publicBaseUrl', () => {
  it('uses MCP_PUBLIC_PORT over listen port', () => {
    const prevHost = process.env.MCP_PUBLIC_HOST;
    const prevPort = process.env.MCP_PUBLIC_PORT;
    process.env.MCP_PUBLIC_HOST = '127.0.0.1';
    process.env.MCP_PUBLIC_PORT = '3001';
    try {
      assert.equal(publicBaseUrl(3000), 'http://127.0.0.1:3001');
    } finally {
      if (prevHost === undefined) delete process.env.MCP_PUBLIC_HOST;
      else process.env.MCP_PUBLIC_HOST = prevHost;
      if (prevPort === undefined) delete process.env.MCP_PUBLIC_PORT;
      else process.env.MCP_PUBLIC_PORT = prevPort;
    }
  });

  it('falls back to listen port when MCP_PUBLIC_PORT unset', () => {
    const prevHost = process.env.MCP_PUBLIC_HOST;
    const prevPort = process.env.MCP_PUBLIC_PORT;
    delete process.env.MCP_PUBLIC_HOST;
    delete process.env.MCP_PUBLIC_PORT;
    try {
      assert.equal(publicBaseUrl(3000), 'http://127.0.0.1:3000');
    } finally {
      if (prevHost === undefined) delete process.env.MCP_PUBLIC_HOST;
      else process.env.MCP_PUBLIC_HOST = prevHost;
      if (prevPort === undefined) delete process.env.MCP_PUBLIC_PORT;
      else process.env.MCP_PUBLIC_PORT = prevPort;
    }
  });
});
