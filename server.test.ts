const request = require('supertest');
const app = require('./app'); // Assuming your server is exported from app.js

describe('Server Endpoints', () => {
	test('GET /api/example should return 200', async () => {
		const response = await request(app).get('/api/example');
		expect(response.status).toBe(200);
		expect(response.body).toEqual({ message: 'Hello World' });
	});
});