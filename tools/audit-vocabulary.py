"""Audit every source record against an official JMdict XML and pinned Tomoshi DB.
Usage: python tools/audit-vocabulary.py JMdict_e.gz dictionary.db output-dir
XML reading and sense restrictions are retained. Chinese source alignment is not
a claim of independent professional translation review.
"""
import collections,csv,gzip,hashlib,json,pathlib,re,sqlite3,sys,unicodedata,xml.etree.ElementTree as ET
if len(sys.argv)!=4:raise SystemExit('Usage: python tools/audit-vocabulary.py JMdict_e.gz dictionary.db output-dir')
root=pathlib.Path(__file__).resolve().parents[1]
def load(name):return json.loads((root/'data'/name).read_text(encoding='utf-8').split('export default ',1)[1].rstrip(';\n'))
words=load('words.js')+load('jlpt-extended.js')
db=sqlite3.connect(pathlib.Path(sys.argv[2]).resolve().as_uri()+'?mode=ro',uri=True)
out=pathlib.Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
def norm(s):return ''.join(chr(ord(c)-0x60) if '\u30a1'<=c<='\u30f6' else c for c in unicodedata.normalize('NFKC',s)).strip()
questions={norm(w['question']) for w in words}
questions.update(norm(part) for w in words for part in re.split('[／/]',w['question']))
questions.update(norm(w['question'][1:]) for w in words if w['question'].startswith(('ご','お')))
questions.update(norm(w['question'][:-2]) for w in words if w['question'].endswith('する'))
questions.update(['衣料','費','着物'])
entries={}
with gzip.open(sys.argv[1],'rb') as f:
    for _,e in ET.iterparse(f,events=['end']):
        if e.tag!='entry':continue
        kanji=[dict(text=k.findtext('keb'),info=[x.text for x in k.findall('ke_inf')],priority=[x.text for x in k.findall('ke_pri')]) for k in e.findall('k_ele')]
        kana=[dict(text=r.findtext('reb'),info=[x.text for x in r.findall('re_inf')],priority=[x.text for x in r.findall('re_pri')],restricted_to=[x.text for x in r.findall('re_restr')],no_kanji=r.find('re_nokanji') is not None) for r in e.findall('r_ele')]
        if any(norm(x['text']) in questions for x in kanji+kana):
            senses_=[dict(kanji=[x.text for x in s.findall('stagk')],readings=[x.text for x in s.findall('stagr')],pos=[x.text for x in s.findall('pos')],misc=[x.text for x in s.findall('misc')],english=[x.text for x in s.findall('gloss')],notes=[x.text for x in s.findall('s_inf')]) for s in e.findall('sense')]
            item=dict(id=e.findtext('ent_seq'),kanji=kanji,kana=kana,senses=senses_)
            entries[item['id']]=item
        e.clear()
chinese_corrections=json.loads((root/'data/chinese-corrections.json').read_text(encoding='utf-8'))
meaning_corrections=json.loads((root/'data/chinese-sense-corrections.json').read_text(encoding='utf-8'))
forms=collections.defaultdict(list)
for e in entries.values():
    for k in e['kanji']+e['kana']:forms[norm(k['text'])].append(e)
bad_reading={'search-only kana form','out-dated or obsolete kana usage','word containing irregular kana usage'}
old_sense={'archaic','obsolete term','historical term','dated term','poetical term'}
def readings(e,q):
    kanji=any(norm(k['text'])==norm(q) for k in e['kanji'])
    return [r for r in e['kana'] if not bad_reading.intersection(r['info']) and ((kanji and not r['no_kanji'] and (not r['restricted_to'] or norm(q) in map(norm,r['restricted_to']))) or (not kanji and norm(r['text'])==norm(q)))]
def senses(e,q,r):
    return [s for s in e['senses'] if (not s['kanji'] or norm(q) in map(norm,s['kanji'])) and (not s['readings'] or norm(r) in map(norm,s['readings']))]
def translated(e,s,reading=None):
    correction=meaning_corrections.get(e['id']+':'+norm(reading or ''))
    if correction and correction['english']==s['english']:return correction['chinese']
    raw=db.execute('SELECT data FROM entries WHERE id=?',(e['id'],)).fetchone()
    zh=db.execute('SELECT data FROM zh_defs_zhtw WHERE entry_id=?',(e['id'],)).fetchone()
    if not raw or not zh:return None
    legacy=json.loads(raw[0]); translation=json.loads(zh[0]).get('senses',{})
    target=set(s['english'])
    matches=[]
    for i,old in enumerate(legacy['senses']):
        english={g['text'] for g in old['glosses'] if g.get('lang')=='eng'}
        score=len(target&english)/max(1,len(target|english))
        if score>0:matches.append((score,i))
    if not matches:return None
    score,i=max(matches)
    if score<.5:return None
    texts=list(dict.fromkeys(g['text'] for g in translation.get(str(i),{}).get('glosses',[]) if g.get('text')))
    return '；'.join(texts) if texts else None
def rank(r):
    return (bool(r['info'] and 'rarely used kana form' in r['info']),not bool(r['priority']))
def choices(q):
    result=[]
    for e in forms[norm(q)]:
        for r in readings(e,q):
            valid=senses(e,q,r['text'])
            modern=[s for s in valid if not old_sense.intersection(s['misc'])]
            if valid:
                first=(modern or valid)[0]
                result.append(dict(reading=norm(r['text']),rank=(not bool(modern),)+rank(r),entry=e['id'],english=first['english'],zh=translated(e,first,r['text']),dated=not bool(modern)))
        # Dictionary sense notes can contain variants intentionally not listed as r_ele.
        if norm(q)=='良い' and e['id']=='1605820' and any('also いい' in note for s in e['senses'] for note in s['notes']):
            result.append(dict(reading='いい',rank=(False,False,False),entry=e['id'],english=e['senses'][0]['english'],zh=translated(e,e['senses'][0]),dated=False))
    modern=[c for c in result if not c['dated']]
    return sorted(modern or result,key=lambda c:c['rank'])
def construction(w):
    q=w['question'];r=norm(w['answer'])
    if '／' in q:
        parts=q.split('／'); cs=[choices(part) for part in parts]
        if all(any(c['reading']==r for c in group) for group in cs):return [c for group in cs for c in group if c['reading']==r],'alternative spellings'
    if q.endswith('する') and r.endswith('する'):
        cs=choices(q[:-2]);valid=[c for c in cs if c['reading']+'する'==r and any('suru' in pos for s in entries[c['entry']]['senses'] for pos in s['pos'])]
        if valid:return [dict(c,reading=r) for c in valid],'suru verb construction'
    if q.startswith(('ご','お')) and r.startswith(q[0]):
        valid=[c for c in choices(q[1:]) if q[0]+c['reading']==r]
        if valid:return [dict(c,reading=r) for c in valid],'honorific prefix construction'
    if q=='衣料費' and r=='いりょうひ':
        a=[c for c in choices('衣料') if c['reading']=='いりょう'];b=[c for c in choices('費') if c['reading']=='ひ']
        if a and b:return [dict(a[0],reading=r,entry=a[0]['entry']+'+'+b[0]['entry'],english=a[0]['english']+b[0]['english'],zh='服裝費')],'compound construction'
    return [],'unresolved'
overrides={};audit=[]
for w in words:
    q='着物' if w['id']=='builtin:198' else w['question']
    cs=choices(q);method='JMdict exact written-form/readings/senses'
    if not cs:cs,method=construction(w)
    accepted=list(dict.fromkeys(c['reading'] for c in cs))
    excluded=not accepted
    answer='/'.join(accepted) if accepted else w['answer']
    # Original translations stay for review unless missing; extended glosses must match a valid sense.
    chinese=w['explanation'];status='original primary gloss reviewed by assistant; complete sense review pending'
    own_id=w['id'].removeprefix('jmdict:')
    relevant=[c for c in cs if c['entry']==own_id] if w['id'].startswith('jmdict:') else [c for c in cs if c['reading'] in map(norm,w['answer'].split('/'))]
    if w['id'].startswith('jmdict:') or not chinese:
        valid_zh=list(dict.fromkeys(c['zh'] for c in relevant if c['zh']))
        if not valid_zh:valid_zh=list(dict.fromkeys(c['zh'] for c in cs if c['zh']))
        if valid_zh:chinese='；'.join(valid_zh);status='sense-aligned to pinned Chinese source; independent semantic review pending'
        else:status='Chinese sense alignment unresolved'
    if cs and all(c['dated'] for c in cs):chinese+='（古語或舊稱）'
    if w['id']=='builtin:198':chinese='和服；日本傳統服裝';status='manually corrected with dictionary'
    if w['id']=='builtin:671':chinese='葡萄；葡萄樹';status='manually corrected with dictionary'
    if q in chinese_corrections:
        chinese=chinese_corrections[q];status='assistant reviewed against dictionary English senses; not professional review'
    # Different readings can have different meanings (e.g. 生物). Show that
    # distinction instead of presenting the first reading's gloss for every answer.
    meanings=collections.OrderedDict()
    for c in cs:
        key=tuple(c['english'])
        group=meanings.setdefault(key,dict(readings=[],zh=c['zh']))
        if c['reading'] not in group['readings']:group['readings'].append(c['reading'])
    if len(meanings)>1 and len(accepted)>1 and all(g['zh'] for g in meanings.values()):
        chinese=' / '.join('/'.join(g['readings'])+'：'+g['zh'] for g in meanings.values())
        status='multiple reading meanings aligned to Chinese source; independent semantic review pending'
    if len(answer)>200 or len(chinese)>1000:raise ValueError('Vocabulary exceeds application limits: '+w['id'])
    # Keep IDs and archived records for bookmarks and old backups.
    override=dict(question=q,answer=answer,explanation=chinese,quizEligible=not excluded)
    overrides[w['id']]=override
    audit.append(dict(id=w['id'],category=w['category'],beforeQuestion=w['question'],question=q,beforeAnswer=w['answer'],answer=answer,beforeExplanation=w['explanation'],explanation=chinese,
        readingStatus='excluded-unresolved' if excluded else 'verified-construction' if method!='JMdict exact written-form/readings/senses' else 'verified-dictionary',method=method,
        entryIds=sorted(set(c['entry'] for c in cs)),chineseStatus=status,sourceEnglish=list(dict.fromkeys(g for c in relevant or cs for g in c['english'])),readingMeanings=[dict(reading=c['reading'],english=c['english'],chinese=c['zh'],entryId=c['entry']) for c in cs],changed=any(w[k]!=override[k] for k in ['question','answer','explanation'])))
levels=collections.defaultdict(int)
for row in audit:levels[unicodedata.normalize('NFKC',row['question'])]=max(levels[unicodedata.normalize('NFKC',row['question'])],int(row['category'][1:]))
for row in audit:
    row['beforeCategory']=row['category']
    row['category']='N'+str(levels[unicodedata.normalize('NFKC',row['question'])])
sha=hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()
with gzip.open(sys.argv[1],'rt',encoding='utf-8') as f:header=f.read(30000)
date=re.search(r'JMdict created:\s*(\d{4}-\d{2}-\d{2})',header)
summary=dict(sourceRecords=len(words),dictionaryMatched=sum(r['readingStatus']=='verified-dictionary' for r in audit),constructionVerified=sum(r['readingStatus']=='verified-construction' for r in audit),excludedUnresolved=sum(r['readingStatus']=='excluded-unresolved' for r in audit),changedRecords=sum(r['changed'] for r in audit),answerChanges=sum(r['beforeAnswer']!=r['answer'] for r in audit),glossChanges=sum(r['beforeExplanation']!=r['explanation'] for r in audit),duplicateWrittenForms=sum(n>1 for n in collections.Counter(r['question'] for r in audit).values()),jmdictSha256=sha,jmdictDate=date.group(1).strip() if date else 'see header',chineseStatusCounts=dict(collections.Counter(r['chineseStatus'] for r in audit)))
(root/'data/vocabulary-audit.js').write_text('// Audited JMdict-derived vocabulary. CC BY-SA 4.0; see NOTICE.md\nexport default '+json.dumps(overrides,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
(root/'data/vocabulary-audit-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'vocabulary-audit.json').write_text(json.dumps(dict(summary=summary,records=audit),ensure_ascii=False,indent=2),encoding='utf-8')
with (out/'vocabulary-audit.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=list(audit[0]);writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows({k:json.dumps(v,ensure_ascii=False) if isinstance(v,list) else v for k,v in r.items()} for r in audit)
(out/'original-translation-review.txt').write_text('\n'.join(f"{r['id']} {r['question']} | {r['explanation']} | {'; '.join(r['sourceEnglish'])}" for r in audit if r['id'].startswith('builtin:')),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
for r in audit:
    if r['readingStatus']=='excluded-unresolved' or r['chineseStatus']=='Chinese sense alignment unresolved':print(json.dumps(r,ensure_ascii=False))
