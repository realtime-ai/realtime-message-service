import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { resetContainer } from '../../infrastructure/container.js';
import type { Express } from 'express';

describe('API Integration Tests', () => {
  let app: Express;

  beforeEach(() => {
    resetContainer();
    app = createApp();
  });

  afterEach(() => {
    resetContainer();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.requestId).toBeDefined();
    });

    it('should include X-Request-ID header', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    it('should authenticate new user', async () => {
      const response = await request(app).post('/auth/login').send({ name: 'TestUser' });

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.name).toBe('TestUser');
      expect(response.body.token).toBeDefined();
      expect(response.body.centrifugoToken).toBeDefined();
    });

    it('should return same user for existing name', async () => {
      const response1 = await request(app).post('/auth/login').send({ name: 'TestUser' });
      const response2 = await request(app).post('/auth/login').send({ name: 'TestUser' });

      expect(response1.body.user.id).toBe(response2.body.user.id);
    });

    it('should reject empty name', async () => {
      const response = await request(app).post('/auth/login').send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should reject missing name', async () => {
      const response = await request(app).post('/auth/login').send({});

      expect(response.status).toBe(400);
    });

    it('should reject name exceeding max length', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ name: 'a'.repeat(51) });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /centrifugo/connect', () => {
    it('should accept valid connection', async () => {
      const response = await request(app)
        .post('/centrifugo/connect')
        .send({
          client: 'client-1',
          transport: 'websocket',
          protocol: 'json',
          encoding: 'json',
          data: {
            userId: 'user-1',
            userName: 'TestUser',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.user).toBe('user-1');
    });

    it('should reject connection without user data', async () => {
      const response = await request(app).post('/centrifugo/connect').send({
        client: 'client-1',
        transport: 'websocket',
        protocol: 'json',
        encoding: 'json',
      });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(4000);
    });
  });

  describe('POST /centrifugo/subscribe', () => {
    beforeEach(async () => {
      // Create a user first
      await request(app)
        .post('/centrifugo/connect')
        .send({
          client: 'client-1',
          transport: 'websocket',
          protocol: 'json',
          encoding: 'json',
          data: {
            userId: 'user-1',
            userName: 'TestUser',
          },
        });
    });

    it('should allow subscription to chat channel', async () => {
      const response = await request(app).post('/centrifugo/subscribe').send({
        client: 'client-1',
        user: 'user-1',
        channel: 'chat',
      });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
    });

    it('should reject subscription to invalid channel', async () => {
      const response = await request(app).post('/centrifugo/subscribe').send({
        client: 'client-1',
        user: 'user-1',
        channel: 'invalid',
      });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(4001);
    });
  });

  describe('POST /centrifugo/publish', () => {
    beforeEach(async () => {
      // Create a user first
      await request(app)
        .post('/centrifugo/connect')
        .send({
          client: 'client-1',
          transport: 'websocket',
          protocol: 'json',
          encoding: 'json',
          data: {
            userId: 'user-1',
            userName: 'TestUser',
          },
        });
    });

    it('should publish valid message', async () => {
      const response = await request(app)
        .post('/centrifugo/publish')
        .send({
          client: 'client-1',
          user: 'user-1',
          channel: 'chat',
          data: { text: 'Hello, World!' },
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.data.text).toBe('Hello, World!');
    });

    it('should reject publish without text', async () => {
      const response = await request(app).post('/centrifugo/publish').send({
        client: 'client-1',
        user: 'user-1',
        channel: 'chat',
        data: {},
      });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(4003);
    });

    it('should reject publish from non-existent user', async () => {
      const response = await request(app)
        .post('/centrifugo/publish')
        .send({
          client: 'client-1',
          user: 'non-existent',
          channel: 'chat',
          data: { text: 'Hello' },
        });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(4002);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });
  });
});
