from __future__ import annotations
import argparse,json,random
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader,TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_score,recall_score,f1_score,roc_auc_score
from advanced_cnn import AdvancedSpectralCNN

def seed_all(s):
    random.seed(s); np.random.seed(s); torch.manual_seed(s)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(s)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--input',default='data/processed/pace_real_dataset.npz')
    p.add_argument('--output',default='ml_service/artifacts/oceannova_advanced_cnn.pt')
    p.add_argument('--epochs',type=int,default=20)
    p.add_argument('--batch-size',type=int,default=64)
    p.add_argument('--seed',type=int,default=42)
    a=p.parse_args(); seed_all(a.seed)
    d=np.load(a.input,allow_pickle=True)
    X=d['X'].astype('float32')
    y=d['candidate_anomaly'].astype('float32')
    context=d['context'].astype('float32')
    X=np.nan_to_num(X,nan=0.0,posinf=0.0,neginf=0.0)
    context=np.nan_to_num(context,nan=0.0,posinf=0.0,neginf=0.0)
    print(f'Dataset: X={X.shape}, context={context.shape}, anomalies={int(y.sum())} ({y.mean()*100:.2f}%)')
    idx=np.arange(len(X))
    tr,va=train_test_split(idx,test_size=.20,random_state=a.seed,stratify=y)
    cm=context[tr].mean(0); cs=context[tr].std(0); cs[cs<1e-8]=1
    context=(context-cm)/cs
    device=torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model=AdvancedSpectralCNN(bands=X.shape[1],context_features=context.shape[1],classes=4).to(device)
    pos=max(float(y[tr].sum()),1); neg=max(float(len(tr)-y[tr].sum()),1)
    loss_fn=nn.BCEWithLogitsLoss(pos_weight=torch.tensor(neg/pos,device=device))
    opt=torch.optim.AdamW(model.parameters(),lr=2e-3,weight_decay=2e-4)
    sched=torch.optim.lr_scheduler.ReduceLROnPlateau(opt,mode='min',factor=.5,patience=2)
    train_ds=TensorDataset(torch.from_numpy(X[tr]),torch.from_numpy(context[tr]),torch.from_numpy(y[tr]))
    val_ds=TensorDataset(torch.from_numpy(X[va]),torch.from_numpy(context[va]),torch.from_numpy(y[va]))
    tl=DataLoader(train_ds,batch_size=a.batch_size,shuffle=True)
    vl=DataLoader(val_ds,batch_size=a.batch_size,shuffle=False)
    best=float('inf'); best_state=None; patience=0
    for ep in range(1,a.epochs+1):
        model.train(); total=0
        for xb,cb,yb in tl:
            xb,cb,yb=xb.to(device),cb.to(device),yb.to(device)
            opt.zero_grad(set_to_none=True)
            out=model(xb,cb); loss=loss_fn(out['anomaly_logit'],yb)
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),2.0); opt.step()
            total += loss.item()*len(yb)
        model.eval(); vtotal=0; probs=[]; ys=[]
        with torch.no_grad():
            for xb,cb,yb in vl:
                xb,cb,yb=xb.to(device),cb.to(device),yb.to(device)
                out=model(xb,cb); loss=loss_fn(out['anomaly_logit'],yb)
                vtotal += loss.item()*len(yb); probs.extend(torch.sigmoid(out['anomaly_logit']).cpu().numpy()); ys.extend(yb.cpu().numpy())
        vloss=vtotal/len(va); sched.step(vloss)
        probs=np.asarray(probs); ys=np.asarray(ys); pred=(probs>=.5).astype(int)
        f1=f1_score(ys,pred,zero_division=0); rec=recall_score(ys,pred,zero_division=0); prec=precision_score(ys,pred,zero_division=0)
        try: auc=roc_auc_score(ys,probs)
        except ValueError: auc=float('nan')
        print(f'Epoch {ep:02d}/{a.epochs} | train_loss={total/len(tr):.4f} | val_loss={vloss:.4f} | precision={prec:.3f} recall={rec:.3f} F1={f1:.3f} AUC={auc:.3f}')
        if vloss < best-1e-4:
            best=vloss; patience=0; best_state={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
        else:
            patience+=1
            if patience>=5: break
    Path(a.output).parent.mkdir(parents=True,exist_ok=True)
    torch.save({'state_dict':best_state or model.state_dict(),'bands':int(X.shape[1]),'context_features':int(context.shape[1]),'context_mean':cm.astype('float32'),'context_std':cs.astype('float32'),'metadata':{'data_source':'NASA PACE OCI L2 AOP','target':'statistical spectral anomaly candidate','target_status':'not field ground truth','train_samples':len(tr),'validation_samples':len(va),'best_val_loss':best}},a.output)
    print(json.dumps({'checkpoint':a.output,'best_val_loss':best,'device':str(device),'train_samples':len(tr),'validation_samples':len(va)},indent=2))

if __name__=='__main__': main()
