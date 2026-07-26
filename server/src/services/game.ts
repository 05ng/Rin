import { Hono } from "hono";
import type { Variables } from "../core/hono-types";

export function GameService() {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.get('/restaurant', async (c) => {
        const cache = c.get('cache');
        const uid = c.get('uid');
        
        if (!uid) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const stateStr = await cache.get(`user_game_restaurant_${uid}`);
        if (!stateStr) {
            return c.json(null);
        }

        try {
            const state = JSON.parse(stateStr);
            return c.json(state);
        } catch (e) {
            return c.json(null);
        }
    });

    app.post('/restaurant', async (c) => {
        const cache = c.get('cache');
        const uid = c.get('uid');
        
        if (!uid) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json();
        await cache.set(`user_game_restaurant_${uid}`, JSON.stringify(body), false);

        return c.json({ success: true });
    });

    return app;
}
