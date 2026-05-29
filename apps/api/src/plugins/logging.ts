import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/** logging plugin */
const plugin: FastifyPluginAsync = async (app) => {
  app.log.info('logging plugin registered');
};

export default fp(plugin, { name: 'logging' });
