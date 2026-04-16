import test from 'node:test';
import { logger } from './logger';

test('logger writes every custom level without colorizer errors', () => {
	logger.trace('trace test');
	logger.debug('debug test');
	logger.info('info test');
	logger.warn('warn test');
	logger.error('error test', new Error('test error'));
	logger.fatal('fatal test', new Error('test fatal'));
});
