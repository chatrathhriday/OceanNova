from __future__ import annotations

import argparse
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from .cnn_dataset import CLASSES, LABEL_RULE_VERSION, normalize_spectra
from .cnn_model import build_model, save_checkpoint


def main() -> None:
    parser = argparse.ArgumentParser(description="Train CPU-friendly OCEANNOVA spectral CNN")
    parser.add_argument("--input", default="data/processed/pace_training.npz")
    parser.add_argument("--output", default="ml_service/artifacts/oceannova_spectral_cnn.pt")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    torch.manual_seed(args.seed); np.random.seed(args.seed)
    data = np.load(args.input, allow_pickle=True)
    spectra = normalize_spectra(data["spectra"] if "spectra" in data else data["X"])
    labels = data["labels"].astype(str) if "labels" in data else data["y"].astype(str)
    contexts = data["context"] if "context" in data else np.zeros((len(spectra), 6), dtype=np.float32)
    unique_labels, counts = np.unique(labels, return_counts=True)
    if len(unique_labels) < 2:
        raise ValueError("CNN training requires at least two evidence-derived classes")
    if len(spectra) < max(32, len(unique_labels) * 8):
        raise ValueError("CNN training requires at least 32 real labeled samples and 8 samples per class")
    if np.min(counts) < 2:
        raise ValueError("Each evidence-derived class needs at least two samples")
    class_names = [name for name in CLASSES if name in set(labels)] or sorted(set(labels))
    indices = {name: i for i, name in enumerate(class_names)}
    y = torch.tensor([indices.get(label, len(class_names) - 1) for label in labels], dtype=torch.long)
    dataset = TensorDataset(torch.tensor(spectra[:, None, :]), torch.tensor(contexts, dtype=torch.float32), y)
    loader = DataLoader(dataset, batch_size=min(64, len(dataset)), shuffle=True)
    model = build_model(len(class_names)); optimizer = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4); loss_fn = nn.CrossEntropyLoss()
    model.train()
    for _ in range(args.epochs):
        for x, context, target in loader:
            optimizer.zero_grad(set_to_none=True); loss = loss_fn(model(x, context), target); loss.backward(); optimizer.step()
    metadata = {"training_samples": len(dataset), "classes": class_names, "label_rule_version": LABEL_RULE_VERSION, "label_provenance": "NASA PACE + NOAA NDBC derived weak labels; not field ground truth", "architecture": "1D CNN spectral encoder + context head", "device": "cpu"}
    save_checkpoint(model, class_names, metadata, args.output)
    print(json.dumps(metadata, indent=2))

if __name__ == "__main__":
    main()
