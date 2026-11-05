// Deterministic test fixtures from archived experimental setups. Never deployed by Deploy.s.sol.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const out=new URL('../test/fixtures/hidden/',import.meta.url);mkdirSync(out,{recursive:true});
for(const [source,name] of [['mission-v2-proof','OpeningVerifier'],['invalid-point-proof','PointVerifier']]){
 const text=readFileSync(new URL(`../../docs/benchmarks/timelock-opening/${source}/PairingVerifier.sol`,import.meta.url),'utf8');
 writeFileSync(new URL(`${name}.sol`,out),text);
}
console.log('Generated archived hidden verifier test fixtures');
