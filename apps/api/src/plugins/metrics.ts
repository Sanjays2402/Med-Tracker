import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/** metrics plugin */
const plugin: FastifyPluginAsync = async (app) => {
  app.log.info('metrics plugin registered');
};

export default fp(plugin, { name: 'metrics' });
