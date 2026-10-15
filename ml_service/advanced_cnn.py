from __future__ import annotations
import torch
from torch import nn
import torch.nn.functional as F

class SE1D(nn.Module):
    def __init__(self, channels, reduction=8):
        super().__init__()
        hidden=max(4, channels//reduction)
        self.net=nn.Sequential(
            nn.AdaptiveAvgPool1d(1), nn.Conv1d(channels,hidden,1), nn.GELU(),
            nn.Conv1d(hidden,channels,1), nn.Sigmoid())
    def forward(self,x): return x*self.net(x)

class ResidualSpectralBlock(nn.Module):
    def __init__(self, cin, cout, dilation=1, dropout=0.08):
        super().__init__()
        k=5; pad=dilation*(k-1)//2
        self.conv1=nn.Conv1d(cin,cout,k,padding=pad,dilation=dilation)
        self.bn1=nn.BatchNorm1d(cout)
        self.conv2=nn.Conv1d(cout,cout,k,padding=pad,dilation=dilation)
        self.bn2=nn.BatchNorm1d(cout)
        self.se=SE1D(cout)
        self.drop=nn.Dropout(dropout)
        self.skip=nn.Conv1d(cin,cout,1) if cin!=cout else nn.Identity()
    def forward(self,x):
        y=F.gelu(self.bn1(self.conv1(x)))
        y=self.drop(y)
        y=self.bn2(self.conv2(y))
        y=self.se(y)
        return F.gelu(y+self.skip(x))

class AdvancedSpectralCNN(nn.Module):
    def __init__(self, bands:int, context_features:int=4, classes:int=4):
        super().__init__()
        self.bands=bands
        self.encoder=nn.Sequential(
            ResidualSpectralBlock(1,48,1), nn.MaxPool1d(2),
            ResidualSpectralBlock(48,72,2), nn.MaxPool1d(2),
            ResidualSpectralBlock(72,96,4), nn.AdaptiveAvgPool1d(12))
        self.context=nn.Sequential(nn.Linear(context_features,32),nn.GELU(),nn.LayerNorm(32))
        self.fusion=nn.Sequential(nn.Linear(96*12+32,192),nn.GELU(),nn.Dropout(.20))
        self.anomaly_head=nn.Sequential(nn.Linear(192,64),nn.GELU(),nn.Linear(64,1))
        self.class_head=nn.Linear(192,classes)
    def forward(self,spectrum,context):
        if spectrum.ndim == 2:
            spectrum=spectrum.unsqueeze(1)
        elif spectrum.ndim != 3:
            raise ValueError(f'spectrum must be [batch,bands] or [batch,1,bands], got {tuple(spectrum.shape)}')
        if spectrum.shape[1] != 1:
            raise ValueError(f'spectrum channel dimension must be 1, got {spectrum.shape[1]}')
        z=self.encoder(spectrum).flatten(1)
        c=self.context(context)
        h=self.fusion(torch.cat([z,c],dim=1))
        return {'anomaly_logit':self.anomaly_head(h).squeeze(1),'class_logits':self.class_head(h),'embedding':h}
