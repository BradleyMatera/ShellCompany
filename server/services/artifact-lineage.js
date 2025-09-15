const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

class ArtifactLineage {
  constructor() {
    this.artifacts = new Map();
    this.lineageGraph = new Map(); // artifact -> creation context
    this.workflowArtifacts = new Map(); // workflow -> artifacts[]
    this.agentArtifacts = new Map(); // agent -> artifacts[]
  }

  /**
   * Record artifact creation with full lineage context
   */
  async recordArtifact(artifactData) {
    const artifactId = uuidv4();
    const timestamp = new Date().toISOString();

    const artifact = {
      id: artifactId,
      ...artifactData,
      createdAt: timestamp,
      lineage: {
        workflowId: artifactData.workflowId,
        taskId: artifactData.taskId,
        agentName: artifactData.agentName,
        directive: artifactData.directive,
        taskTitle: artifactData.taskTitle,
        creationReason: artifactData.creationReason || 'Task execution',
        parentArtifacts: artifactData.parentArtifacts || [],
        modificationHistory: [{
          timestamp,
          action: 'created',
          agent: artifactData.agentName,
          details: artifactData.creationReason
        }]
      },
      metadata: {
        fileSize: artifactData.fileSize,
        fileType: artifactData.fileType,
        encoding: artifactData.encoding || 'utf8',
        checksum: artifactData.checksum,
        relativePath: artifactData.relativePath,
        absolutePath: artifactData.absolutePath
      },
      content: artifactData.content,
      status: 'active'
    };

    // Store artifact
    this.artifacts.set(artifactId, artifact);

    // Update lineage mappings
    this.lineageGraph.set(artifactId, {
      workflow: artifactData.workflowId,
      task: artifactData.taskId,
      agent: artifactData.agentName,
      parents: artifactData.parentArtifacts || [],
      children: []
    });

    // Update workflow artifacts
    if (!this.workflowArtifacts.has(artifactData.workflowId)) {
      this.workflowArtifacts.set(artifactData.workflowId, []);
    }
    this.workflowArtifacts.get(artifactData.workflowId).push(artifactId);

    // Update agent artifacts
    if (!this.agentArtifacts.has(artifactData.agentName)) {
      this.agentArtifacts.set(artifactData.agentName, []);
    }
    this.agentArtifacts.get(artifactData.agentName).push(artifactId);

    // Update parent-child relationships
    if (artifactData.parentArtifacts) {
      for (const parentId of artifactData.parentArtifacts) {
        const parentLineage = this.lineageGraph.get(parentId);
        if (parentLineage) {
          parentLineage.children.push(artifactId);
        }
      }
    }

    console.log(`[LINEAGE] Recorded artifact ${artifactId}: ${artifact.name} by ${artifactData.agentName}`);
    
    return artifact;
  }

  /**
   * Update existing artifact (for edits, saves, etc.)
   */
  async updateArtifact(artifactId, updates, modificationContext) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    // Record modification
    const modification = {
      timestamp: new Date().toISOString(),
      action: modificationContext.action || 'modified',
      agent: modificationContext.agentName || 'user',
      details: modificationContext.details || 'File updated',
      changes: modificationContext.changes
    };

    artifact.lineage.modificationHistory.push(modification);

    // Update content if provided
    if (updates.content !== undefined) {
      artifact.content = updates.content;
      artifact.metadata.fileSize = Buffer.byteLength(updates.content, 'utf8');
    }

    // Update metadata
    if (updates.metadata) {
      Object.assign(artifact.metadata, updates.metadata);
    }

    artifact.lastModified = modification.timestamp;

    console.log(`[LINEAGE] Updated artifact ${artifactId} by ${modification.agent}: ${modification.action}`);
    
    return artifact;
  }

  /**
   * Get artifact with full lineage information
   */
  getArtifactWithLineage(artifactId) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      return null;
    }

    const lineage = this.lineageGraph.get(artifactId);
    const parentArtifacts = lineage.parents.map(pid => this.artifacts.get(pid)).filter(Boolean);
    const childArtifacts = lineage.children.map(cid => this.artifacts.get(cid)).filter(Boolean);

    return {
      ...artifact,
      fullLineage: {
        parents: parentArtifacts.map(a => ({
          id: a.id,
          name: a.name,
          agent: a.lineage.agentName,
          createdAt: a.createdAt
        })),
        children: childArtifacts.map(a => ({
          id: a.id,
          name: a.name,
          agent: a.lineage.agentName,
          createdAt: a.createdAt
        })),
        workflow: {
          id: artifact.lineage.workflowId,
          directive: artifact.lineage.directive
        },
        task: {
          id: artifact.lineage.taskId,
          title: artifact.lineage.taskTitle
        }
      }
    };
  }

  /**
   * Get all artifacts for a workflow
   */
  getWorkflowArtifacts(workflowId) {
    const artifactIds = this.workflowArtifacts.get(workflowId) || [];
    return artifactIds.map(id => this.artifacts.get(id)).filter(Boolean);
  }

  /**
   * Get all artifacts for an agent
   */
  getAgentArtifacts(agentName) {
    const artifactIds = this.agentArtifacts.get(agentName) || [];
    return artifactIds.map(id => this.artifacts.get(id)).filter(Boolean);
  }

  /**
   * Search artifacts by various criteria
   */
  searchArtifacts(criteria) {
    const results = [];
    
    for (const artifact of this.artifacts.values()) {
      let matches = true;

      if (criteria.workflowId && artifact.lineage.workflowId !== criteria.workflowId) {
        matches = false;
      }

      if (criteria.agentName && artifact.lineage.agentName !== criteria.agentName) {
        matches = false;
      }

      if (criteria.fileName && !artifact.name.toLowerCase().includes(criteria.fileName.toLowerCase())) {
        matches = false;
      }

      if (criteria.fileType && artifact.metadata.fileType !== criteria.fileType) {
        matches = false;
      }

      if (criteria.createdAfter && new Date(artifact.createdAt) < new Date(criteria.createdAfter)) {
        matches = false;
      }

      if (criteria.content && !artifact.content.toLowerCase().includes(criteria.content.toLowerCase())) {
        matches = false;
      }

      if (matches) {
        results.push(this.getArtifactWithLineage(artifact.id));
      }
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Generate clickable lineage links for console logs
   */
  generateLineageLinks(artifactId) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      return null;
    }

    return {
      artifactId,
      consoleLink: `/console?artifact=${artifactId}&workflow=${artifact.lineage.workflowId}`,
      agentLink: `/agents/${artifact.lineage.agentName}?file=${encodeURIComponent(artifact.name)}`,
      projectLink: `/projects/${artifact.lineage.workflowId}?artifact=${artifactId}`,
      lineageChain: this.getLineageChain(artifactId)
    };
  }

  /**
   * Get full lineage chain (parents -> artifact -> children)
   */
  getLineageChain(artifactId) {
    const chain = [];
    const visited = new Set();
    
    // Get all parents recursively
    const getParents = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const lineage = this.lineageGraph.get(id);
      if (lineage && lineage.parents) {
        for (const parentId of lineage.parents) {
          getParents(parentId);
          const parent = this.artifacts.get(parentId);
          if (parent) {
            chain.unshift({
              id: parentId,
              name: parent.name,
              agent: parent.lineage.agentName,
              type: 'parent'
            });
          }
        }
      }
    };

    getParents(artifactId);

    // Add current artifact
    const artifact = this.artifacts.get(artifactId);
    if (artifact) {
      chain.push({
        id: artifactId,
        name: artifact.name,
        agent: artifact.lineage.agentName,
        type: 'current'
      });
    }

    // Add children
    const lineage = this.lineageGraph.get(artifactId);
    if (lineage && lineage.children) {
      for (const childId of lineage.children) {
        const child = this.artifacts.get(childId);
        if (child) {
          chain.push({
            id: childId,
            name: child.name,
            agent: child.lineage.agentName,
            type: 'child'
          });
        }
      }
    }

    return chain;
  }

  /**
   * Get comprehensive lineage report for debugging
   */
  getLineageReport() {
    return {
      totalArtifacts: this.artifacts.size,
      workflowsWithArtifacts: this.workflowArtifacts.size,
      agentsWithArtifacts: this.agentArtifacts.size,
      artifactsByWorkflow: Array.from(this.workflowArtifacts.entries()).map(([workflowId, artifacts]) => ({
        workflowId,
        artifactCount: artifacts.length
      })),
      artifactsByAgent: Array.from(this.agentArtifacts.entries()).map(([agentName, artifacts]) => ({
        agentName,
        artifactCount: artifacts.length
      })),
      recentArtifacts: Array.from(this.artifacts.values())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map(a => ({
          id: a.id,
          name: a.name,
          agent: a.lineage.agentName,
          workflow: a.lineage.workflowId,
          createdAt: a.createdAt
        }))
    };
  }

  /**
   * Sync with file system to detect external changes
   */
  async syncWithFileSystem(workspaceRoot) {
    const syncResults = {
      scanned: 0,
      matched: 0,
      orphaned: 0,
      missing: 0
    };

    try {
      // Scan all registered artifacts
      for (const artifact of this.artifacts.values()) {
        syncResults.scanned++;
        
        if (artifact.metadata.absolutePath) {
          try {
            const stats = await fs.stat(artifact.metadata.absolutePath);
            const currentSize = stats.size;
            
            if (currentSize !== artifact.metadata.fileSize) {
              // File was modified externally
              const content = await fs.readFile(artifact.metadata.absolutePath, 'utf8');
              await this.updateArtifact(artifact.id, { content }, {
                action: 'external_modification',
                agentName: 'system',
                details: 'File modified outside of platform'
              });
            }
            
            syncResults.matched++;
          } catch (error) {
            // File no longer exists
            artifact.status = 'missing';
            syncResults.missing++;
            console.log(`[LINEAGE] Artifact file missing: ${artifact.metadata.absolutePath}`);
          }
        }
      }

      console.log(`[LINEAGE] Sync complete: ${syncResults.matched} matched, ${syncResults.missing} missing of ${syncResults.scanned} artifacts`);
    } catch (error) {
      console.error('[LINEAGE] Filesystem sync error:', error);
    }

    return syncResults;
  }
}

module.exports = ArtifactLineage;
