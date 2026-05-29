import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/** requestId plugin */
const plugin: FastifyPluginAsync = async (app) => {
  app.log.info('requestId plugin registered');
};

export default fp(plugin, { name: 'requestId' });
