import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/** errorHandler plugin */
const plugin: FastifyPluginAsync = async (app) => {
  app.log.info('errorHandler plugin registered');
};

export default fp(plugin, { name: 'errorHandler' });
