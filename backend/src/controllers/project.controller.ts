import { Request, Response } from 'express';
import * as projectService from '@services/project.service.js';
import type { CreateProjectData, UpdateProjectData } from '@models/project.model.js';

/**
 * 프로젝트 생성
 */
export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectName, ownerId, patientInfo } = req.body;

    if (!projectName || !ownerId) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: projectName, ownerId',
      });
      return;
    }

    const projectData: CreateProjectData = {
      projectName,
      ownerId,
      patientInfo,
    };

    const project = await projectService.createProject(projectData);

    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project',
    });
  }
};

/**
 * 프로젝트 조회
 */
export const getProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await projectService.getProjectById(projectId);

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get project',
    });
  }
};

/**
 * 사용자의 프로젝트 목록 조회
 */
export const getUserProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ownerId } = req.query;

    if (!ownerId || typeof ownerId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required query parameter: ownerId',
      });
      return;
    }

    const projects = await projectService.getProjectsByOwnerId(ownerId);

    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error('Error getting user projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user projects',
    });
  }
};

/**
 * 프로젝트 업데이트
 */
export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const updateData: UpdateProjectData = req.body;

    await projectService.updateProject(projectId, updateData);

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update project',
    });
  }
};

/**
 * 프로젝트 삭제
 */
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    await projectService.deleteProject(projectId);

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete project',
    });
  }
};
