import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/** auth plugin */
const plugin: FastifyPluginAsync = async (app) => {
  app.log.info('auth plugin registered');
};

export default fp(plugin, { name: 'auth' });
