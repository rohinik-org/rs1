# @rohinik-org/ml-ir

ML Core IR — the single authoritative contract package for the Rohinik ML subsystem (Stage 12A).

## One-package rule

There is exactly one public ML IR package. No second package may use `ml-ir` in its name or duplicate these contracts.

## Constraints

- No PyTorch, TensorFlow, ONNX Runtime, scikit-learn, XGBoost, MLflow, cloud ML SDK, or Kubernetes SDK dependency.
- Contracts only. No training, evaluation, deployment, inference, or drift detection logic.
- Framework-neutral — any ML provider implements against these interfaces.

## Laws

LAW-064 Framework Neutrality | LAW-065 Dataset Identity and Lineage | LAW-066 Training Reproducibility |
LAW-067 Training Does Not Promote | LAW-068 Evaluation Before Promotion | LAW-069 Promotion Before Deployment |
LAW-070 Observable Inference | LAW-071 Governed Operational Response
