import { Router } from 'express';
import * as projectController from '@controllers/project.controller.js';

const router = Router();

/**
 * POST /api/projects
 * 프로젝트 생성
 */
router.post('/', projectController.createProject);

/**
 * GET /api/projects?ownerId=xxx
 * 사용자의 프로젝트 목록 조회
 */
router.get('/', projectController.getUserProjects);

/**
 * GET /api/projects/:projectId
 * 프로젝트 조회
 */
router.get('/:projectId', projectController.getProject);

/**
 * PUT /api/projects/:projectId
 * 프로젝트 업데이트
 */
router.put('/:projectId', projectController.updateProject);

/**
 * DELETE /api/projects/:projectId
 * 프로젝트 삭제
 */
router.delete('/:projectId', projectController.deleteProject);

export default router;
