from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import numpy as np, pandas as pd, joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from backend.ml import FEATURES

rng=np.random.default_rng(42)
n=4000
df=pd.DataFrame({
 "duty_hours":rng.normal(9.0,2.0,n).clip(4,16),
 "sleep_hours":rng.normal(6.8,1.1,n).clip(3.5,9),
 "fatigue":rng.normal(5.0,2.0,n).clip(0,10),
 "mood":rng.normal(6.0,1.8,n).clip(0,10),
 "focus":rng.normal(6.2,1.7,n).clip(0,10),
 "social_support":rng.normal(6.4,1.8,n).clip(0,10),
 "recovery_gap":rng.normal(5.0,2.8,n).clip(0,14),
 "workload":rng.normal(5.8,2.0,n).clip(0,10)
})
score=(0.24*(df.duty_hours/16)+0.24*(1-df.sleep_hours/9)+0.20*(df.fatigue/10)+
       0.12*(1-df.mood/10)+0.08*(1-df.focus/10)+0.05*(1-df.social_support/10)+
       0.04*(df.recovery_gap/14)+0.03*(df.workload/10)+rng.normal(0,.06,n))
y=(score>0.52).astype(int)
Xtr,Xte,ytr,yte=train_test_split(df[FEATURES],y,test_size=.25,random_state=42,stratify=y)
model=RandomForestClassifier(n_estimators=260,max_depth=9,class_weight="balanced",random_state=42,n_jobs=-1)
model.fit(Xtr,ytr)
p=model.predict(Xte); proba=model.predict_proba(Xte)[:,1]
cm=confusion_matrix(yte,p).tolist()
metrics={
 "samples": int(n), "test_samples": int(len(yte)),
 "accuracy": round(float(accuracy_score(yte,p)),4),
 "precision": round(float(precision_score(yte,p)),4),
 "recall": round(float(recall_score(yte,p)),4),
 "f1": round(float(f1_score(yte,p)),4),
 "roc_auc": round(float(roc_auc_score(yte,proba)),4),
 "confusion_matrix": cm,
 "note":"Synthetic demonstration dataset; metrics are not evidence of field performance."
}
bundle={"model":model,"features":FEATURES,"metrics":metrics}
out=Path(__file__).resolve().parent.parent/"models"/"stress_model.joblib"
joblib.dump(bundle,out)
print("Saved",out)
print(metrics)
