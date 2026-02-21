# Agent Cooperation Framework - Quick Reference

## 🚫 7 Critical Antipatterns to Avoid

| # | Antipattern | Why It Fails | Quick Fix |
|---|------------|--------------|-----------|
| 1 | **Excessive Centralization** | Single point of failure, O(n²) scaling, slow response | Enable local decision-making, distributed coordination |
| 2 | **No Spatial Structure** | Free-rider exploitation, no benefit locality | Create local neighborhoods, cluster cooperators |
| 3 | **Over-Specialization** | Fragile to agent loss, cascading failures | Maintain 2-3 agents per critical role, add redundancy |
| 4 | **Linear Response** | Noise amplification, wasted resources | Implement activation thresholds, binary state transitions |
| 5 | **Pure Positive Feedback** | Runaway processes, system collapse | Balance with negative feedback for homeostasis |
| 6 | **No Reputation Tracking** | Cooperation collapses (Prisoner's Dilemma) | Track reputation, use Tit-for-Tat strategy |
| 7 | **Homogeneous Agents** | Groupthink, misses optimal solutions | Diversify strategies and approaches |

---

## ✅ 10 Core Best Practices

### 1. Local Interactions → Global Patterns
- Agents interact with 5-15 neighbors
- Self-organize task assignment
- **Benefit**: O(n) scaling, robust to failures

### 2. Threshold-Based Action
- Define activation thresholds (0.2 / 0.5 / 0.8)
- Aggregate signals before threshold check
- **Benefit**: Noise filtering, synchronized transitions

### 3. Division of Labor
- Role specialization with clear interfaces
- Track success rates by task type
- **Benefit**: Specialists outperform generalists

### 4. Benefit Locality
- Structure interactions within neighborhoods
- 70% local, 30% extended distribution
- **Benefit**: Cooperators benefit from cooperation

### 5. Hierarchical Modularity
- Agents → Pods (3-7) → Squads (3-5) → Teams
- Local autonomy, global coordination
- **Benefit**: Scalability beyond 15 agents

### 6. Redundancy
- 2-3 agents per critical capability
- Multiple pathways for same outcome
- **Benefit**: Tolerates agent failures

### 7. Balanced Feedback
- Positive: Rapid commitment during transitions
- Negative: Homeostasis during operation
- **Benefit**: Responsive yet stable

### 8. Reputation Tracking
- Track cooperation/defection events
- Use Tit-for-Tat (cooperate first, mirror thereafter)
- **Benefit**: Sustains cooperation, excludes free-riders

### 9. Distributed Sensing
- All agents monitor local conditions
- Information diffuses through network
- **Benefit**: No single point of failure

### 10. Cognitive Diversity
- Multiple algorithmic strategies per swarm
- Strategy selection based on problem type
- **Benefit**: Explores solution space effectively

---

## 📊 Key Metrics to Monitor

### Cooperation Metrics
- Cooperation Rate: % cooperative interactions
- Free-Rider Rate: % non-contributing agents
- Reputation Distribution: Histogram of scores

### Performance Metrics
- Task Completion Time
- Success Rate
- Resource Utilization
- Scalability Factor

### Robustness Metrics
- Failure Tolerance: Agents lost before degradation
- Recovery Time: Time to recover from failures
- Cascading Failure Rate: Frequency of propagation

---

## 🔧 Implementation Quick-Start

### Week 1-2: Foundation
```python
# Local neighborhoods
class LocalAgent:
    neighbors = []  # 5-15 agents
    neighborhood_radius = 3

# Threshold-based activation
class ThresholdAgent:
    activation_threshold = 0.75
    signal_window = 5
    state = "inactive"

# Basic reputation
class ReputationAgent:
    reputation_db = {}  # agent_id -> score
    initial_reputation = 0.5
```

### Week 3-4: Cooperation
```python
# Tit-for-Tat strategy
def should_cooperate_with(self, agent_id):
    rep = self.reputation_db.get(agent_id, self.initial_reputation)
    if rep > 0.7: return True  # High reputation
    if rep > 0.3: return random() < 0.5  # Test
    return False  # Low reputation

# Benefit locality
def contribute(self, resource):
    to_neighbors = resource * 0.7
    to_network = resource * 0.3
    self.distribute(to_neighbors, to_network)
```

### Week 5-6: Scaling
```python
# Hierarchical modularity
class Pod:
    agents = []  # 3-7 agents
    pod_leader = agents[0]

class Squad:
    pods = []  # 3-5 pods
    coordinator = pods[0].pod_leader

# Redundancy
class RedundantCapability:
    primary = agent_1
    secondary = agent_2
    def execute(task):
        return self.primary.execute() or self.secondary.execute()
```

### Week 7-8: Optimization
```python
# Balanced feedback
if self.state == "idle" and signal > threshold:
    self.amplify_signal()  # Positive feedback
elif self.state == "active":
    self.adjust_to_homeostasis()  # Negative feedback

# Strategy diversity
strategies = ['greedy', 'sa', 'genetic', 'gradient']
agent.strategy = random.choice(strategies)
```

---

## 🎯 Core Principles Summary

| Principle | Essence |
|-----------|---------|
| **Local First** | Global patterns emerge from local interactions |
| **Threshold Action** | Filter noise, enable synchronization |
| **Structured Cooperation** | Benefit locality prevents exploitation |
| **Redundant by Design** | Robustness requires apparent inefficiency |
| **Reputation Matters** | Trust enables indirect reciprocity |
| **Diverse Strategies** | Multiple approaches explore solution space |
| **Balanced Feedback** | Positive for transitions, negative for stability |
| **Modular Hierarchy** | Scales beyond Dunbar's number (~15) |

---

## ⚠️ Common Pitfalls

| Pitfall | Prevention |
|--------|------------|
| Adding more centralization as system grows | Instead, add hierarchical modules |
| Ignoring reputation due to complexity | Start simple: track +1/-1 per interaction |
| Removing redundancy to "optimize" | Keep 2-3 agents per critical role |
| Setting thresholds too low | Tune empirically: aim for false negative < 5% |
| All agents using identical algorithm | Intentionally diversify strategies |
| No negative feedback | Always add homeostatic regulation |

---

## 📚 Key References

- **Source Document**: `/research/organizational-patterns-comprehensive-report.md`
- **Full Framework**: `/docs/agent-cooperation-framework-v2.md`
- **Universal Patterns**: Distributed sensing, threshold action, division of labor, cooperation mechanisms, network architecture

---

## 💡 Quick Decision Guide

**Situation**: System growing slow, decision bottlenecks?
→ **Solution**: Implement local neighborhoods, decentralize decision-making

**Situation**: Cooperation decaying over time?
→ **Solution**: Add reputation tracking, use Tit-for-Tat, structure local interactions

**Situation**: Single agent failure cripples system?
→ **Solution**: Add redundancy (2-3 agents per critical role), design failover

**Situation**: Agents responding to noise, wasting resources?
→ **Solution**: Implement activation thresholds, aggregate signals before action

**Situation**: Swarm stuck in local optimum?
→ **Solution**: Diversify strategies, allow multiple algorithms in parallel

**Situation**: System growing beyond 50 agents?
→ **Solution**: Implement hierarchical modularity (agents → pods → squads → teams)

---

**Remember**: Effective agent cooperation emerges from simple local rules, not complex central control. Focus on structure, thresholds, reputation, and diversity—global coordination will follow naturally.
