import { useEffect, useState } from "react";

type Props={open:boolean;message?:string};
export function ConcurrencyConflictModal({open,message}:Props){
 const [visible,setVisible]=useState(open);
 useEffect(()=>setVisible(open),[open]);
 if(!visible)return null;
 return <div className="module04-modal-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)setVisible(false);}}><section className="module04-modal concurrency-dialog" role="alertdialog" aria-modal="true" aria-labelledby="concurrency-title"><div className="module04-modal-head"><div><p className="eyebrow">Änderungskonflikt</p><h2 id="concurrency-title">Dieser Datensatz wurde zwischenzeitlich geändert.</h2></div><button className="module04-modal-close" type="button" onClick={()=>setVisible(false)} aria-label="Schließen">×</button></div><div className="module04-modal-description">{message||"Bitte lade den aktuellen Stand neu. Deine Änderung wurde nicht überschrieben."}</div><div className="module04-modal-actions"><button className="secondary-button" type="button" onClick={()=>setVisible(false)}>Schließen</button><button className="primary-button" type="button" onClick={()=>window.location.reload()}>Aktuellen Stand laden</button></div></section></div>;
}
