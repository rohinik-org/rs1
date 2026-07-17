import { describe, it, expect } from 'vitest'
import { DefaultRecommendationPolicy } from '../policy/recommendation-policy.js'

describe('DefaultRecommendationPolicy', () => {
  it('has versioned policyId', () => {
    const p = new DefaultRecommendationPolicy()
    expect(p.policyId).toMatch(/@\d/)
  })

  it('default maxResults is 5', () => {
    expect(new DefaultRecommendationPolicy().maxResults).toBe(5)
  })

  it('override maxResults respected', () => {
    expect(new DefaultRecommendationPolicy({ maxResults: 10 }).maxResults).toBe(10)
  })

  it('WORKFLOW_STEP is in default allowedTypes', () => {
    const p = new DefaultRecommendationPolicy()
    expect(p.allowedTypes).toContain('WORKFLOW_STEP')
  })

  it('custom allowedTypes override accepted', () => {
    const p = new DefaultRecommendationPolicy({ allowedTypes: ['ALTERNATIVE'] })
    expect(p.allowedTypes).toEqual(['ALTERNATIVE'])
    expect(p.allowedTypes).not.toContain('RELATED_CAPABILITY')
  })
})
