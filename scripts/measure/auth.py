import json,urllib.request,base64,sys
RPC="https://api.mainnet-beta.solana.com"
def rpc(m,p):
    r=urllib.request.Request(RPC,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(r,timeout=30))["result"]
import hashlib
B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b):
    n=int.from_bytes(b,'big');s=''
    while n: n,r=divmod(n,58); s=B58[r]+s
    return '1'*(len(b)-len(b.lstrip(b'\0')))+s
progs=dict(l.split() for l in open('programs.txt') if l.strip())
for name,pid in progs.items():
    try:
        a=rpc("getAccountInfo",[pid,{"encoding":"jsonParsed"}])["value"]
        pd=a["data"]["parsed"]["info"]["programData"]
        d=rpc("getAccountInfo",[pd,{"encoding":"jsonParsed"}])["value"]["data"]["parsed"]["info"]
        au=d.get("authority"); owner=None
        if au:
            ai=rpc("getAccountInfo",[au,{"encoding":"base64"}])["value"]
            owner=ai["owner"] if ai else "none(system wallet/PDA?)"
        print(name,pid,"slot",d.get("slot"),"authority",au,"authOwner",owner)
    except Exception as e: print(name,pid,"ERR",e)
