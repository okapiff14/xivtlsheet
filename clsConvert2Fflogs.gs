////////////////////////////////////////
// FFLogsからタイムラインを作成
////////////////////////////////////////

var Convert2Fflogs = function(outputType, job) {
  // バトルログを取得
  var fightCode = dialogFflogs();
  if (!fightCode) return;
  var logCode = fightCode.replace(/(.*)\/?#fight=.*$/, "$1");
  var fId =　fightCode.replace(/.*fight=(.*?)(&|$)/, "$1");
  
  // 出力する対象
  this.outputType = outputType;

  // startRow
  this.startRow = getStartRow(outputType);
  
  // 出力するタイムライン
  this.tlType = OUTPUT_TIMELINE;
  if (booOutputTlSkill()) this.tlType = OUTPUT_SKILL;

  // シート名
  if (this.outputType == OUTPUT_LOG) {
    this.sheetName = SHEET_LOG;
  } else {
    this.sheetName = SHEET_TIMELINE;
  }
  
  // シートの存在チェック
  if(!booSheet(this.sheetName)) {
    Browser.msgBox(ERR_NO_TEMP);
    return;
  }
  

  this.data2Parse(logCode, fId, job);
  
  return true;
}


// データをパース
Convert2Fflogs.prototype.data2Parse = function(logCode, fId, jobName) {
  // 開始時間、終了時間の抽出
  try {
    var response = UrlFetchApp.fetch(LOGS_HOST + "report/fights/" + logCode + "?api_key=" + LOGS_KEY);
    var responseCode = response.getResponseCode();
  } catch(e) {
    var responseCode = -1;
  }  
  
  if (responseCode != 200) {
    Browser.msgBox(ERR_NO_URL);
    return false;
  }
  
  
  var jsonFights = JSON.parse(response.getContentText());
  var fight = jsonFights["fights"][fId - 1];
  this.startTime = fight["start_time"];
  this.endTime   = fight["end_time"];
  
  // sourceIdの取得
  this.friendlies = this.getPartyData("friendlies", jsonFights, fId);
  this.friendlyPets = this.getPartyData("friendlyPets", jsonFights, fId);
  this.enemies = this.getPartyData("enemies", jsonFights, fId);
  
  // ユーザの設定
  if (jobName == undefined) {
    this.userName = dialogJob(this.friendlies);
  } else {
    this.userName = getFriendryName(jobName, this.friendlies)
  }
  if (!this.userName) return false;
  
  // Job {user : job}
  var jobs = this.getPartyJob("friendlies", jsonFights, fId);
  
  // 出力クラス
  this.clsOutput = new clsOutput(this.outputType, this.startRow,　this.tlType, this.userName);

  
  var startTime = this.startTime;
  var endTime = this.endTime;

  var oValues = [];
  var oBuffs  = [];

  // シートをクリア
  if(booOutputToTL(this.outputType)) {
    deleteRows(this.sheetName, this.startRow);
  } else {
    clearBuffs(this.sheetName, this.startRow);
  }
  
  // 開始時間のセット
  oValues.push(getTlValue({"time": this.getTime(startTime), "type": AC_CONBATSTART}));


  // logを抽出
  var logs = [];
  while(startTime != undefined) {
    var response = UrlFetchApp.fetch(LOGS_HOST + "report/events/" + logCode + "?start=" + startTime + "&end=" + endTime + "&translate=true&api_key=" + LOGS_KEY);
    var jsonEvents = JSON.parse(response.getContentText());
    var events = jsonEvents["events"];
    startTime = jsonEvents["nextPageTimestamp"];

    if (jsonEvents["type"] == "death" && jsonEvents["targetIsFriendly"] == false) break;
    for (var idx in events) {
      var event = events[idx];
      
      if (event["type"] == "death" && event["targetIsFriendly"] == false) break;
      if (event["type"] == "death") continue;
      
      // AAは無視
      if (booAA(event["ability"]["name"])) continue;
      
      // dot,hotは無視
      if (event["tick"]) continue;
      
      var ability = event["ability"]["name"];
      if (ability == "" || booSkipDebuff(ability)) continue;
      
      if (event["ability"]["name"] == "ヘリオス") {
        Logger.log(event);
      }

      
      var who  = "";
      var sourceId = event["sourceID"];
      if (event["sourceIsFriendly"]) {
        if (this.friendlies[sourceId]) who = this.friendlies[sourceId]["name"];
        if (who == "" && this.friendlyPets[sourceId]) who = this.friendlyPets[sourceId]["name"];
      } else {
        if (this.enemies[sourceId]) who = this.enemies[sourceId]["name"];
      }

      var whom = "";
      var targetId = event["targetID"];
      if (event["targetIsFriendly"]) {
        if (this.friendlies[targetId]) whom = this.friendlies[targetId]["name"];
        if (whom == "" && this.friendlyPets[targetId]) whom = this.friendlyPets[targetId]["name"];
      } else {
        if (this.enemies[targetId]) whom = this.enemies[targetId]["name"];
      }
      
      var type = this.getType(event);
      if (type == null) continue;
      
      
      var val = getTlValue({
        "time" : this.getTime(event["timestamp"]), 
        "type" : type,
        "who"  : who,
        "whom" : whom,
        "event": ability
      });
      
      val["booFriendly"] = event["sourceIsFriendly"];
      
      // 配列に追加
      logs.push(val);
    }
  }

  
  // フィルタリング
  for (var idx in logs) {
    var log = logs[idx];
    
    if (this.tlType == OUTPUT_TIMELINE && !log["booFriendly"]) {
      if (log["type"] == AC_LOSE_EFFECT) continue;
      if (!this.clsOutput.booContinue(oValues, log)) oValues.push(log);
      
    } else {
      if (this.tlType == OUTPUT_SKILL) {
        if (!this.clsOutput.booContinue(oValues, log)) oValues.push(log);
      }
      if (this.outputType != OUTPUT_TIMELINE && this.outputType != OUTPUT_LOG) {
        if (this.clsOutput.outputBuffCol(log, jobs) != null) oBuffs.push(log);
      }
    }
  }
  
  // 終了時間のセット
  oValues.push(getTlValue({"time": this.getTime(endTime), "type": AC_COMBATEND}));

  
  // シートに書き込み
  objSheet = SpreadsheetApp.getActive().getSheetByName(this.sheetName);
  this.outputOValue(objSheet, oValues);
  this.outputOBuff(objSheet, oBuffs, jobs);
}


// TIMELINE欄に出力
Convert2Fflogs.prototype.outputOValue = function(sheet, datas) {
  this.clsOutput.outputTimeline(sheet, datas);
}

// BUFF欄に出力
Convert2Fflogs.prototype.outputOBuff = function(sheet, datas, jobs) {
  var startRow = this.startRow;
  var oLastRow = datas.length;
  
  for(var rowNum=0;rowNum<oLastRow;rowNum++) { 
    startRow = this.clsOutput.outputallbuff(sheet, startRow, datas[rowNum], jobs);
  }
}


Convert2Fflogs.prototype.getPartyData = function(key, json, fId) {
  var values = json[key];
  var ids = {};
  
  for (var idx in values) {
    var value = values[idx];
    
    for (var fKey in value["fights"]) {
      var fight = value["fights"][fKey];
      
      if (fight["id"] == fId) {
        ids[value["id"]] = {"name": value["name"], "type": value["type"]};
        break;
      }
    }
  }

  return ids;
}

Convert2Fflogs.prototype.getPartyJob = function(key, json, fId) {
  var values = json[key];
  var ids = {};
  
  for (var idx in values) {
    var value = values[idx];

    for (var fKey in value["fights"]) {
      var fight = value["fights"][fKey];
      
      if (fight["id"] == fId) {
        ids[value["name"]] = value["type"];
        break;
      }
    }
  }

  return ids;
}

Convert2Fflogs.prototype.getType = function(event) {
  var type = event["type"];
  
  if (type == "begincast") {
    return AC_START_USING;
  } else if (event["target"]　!= undefined && event["target"]["name"] == "Environment") {
    return AC_AOE;
  } else if(type == "cast") {
    return AC_ACTION;
  } else if(type == "heal" && event["targetID"] != undefined && event["targetIsFriendly"]) {
    return AC_EFFECT;
  } else if(type == "applybuff" || type == "applydebuff" || type == "applybuffstack") {
    return AC_EFFECT;
  } else if (type == "refreshbuff" || type == "refreshdebuff") {
    return AC_REFRESH;
  } else if(type == "removebuff" || type == "removedebuff") {
    return AC_LOSE_EFFECT;
  } else {
    return null;
  }
}

Convert2Fflogs.prototype.getTime = function(time) {
  var sec = Math.floor((time - this.startTime) / 1000);
  return sec2Time(sec);
}