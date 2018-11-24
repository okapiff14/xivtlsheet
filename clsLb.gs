////////////////////////////////////////
// シナジー出力セル定義
////////////////////////////////////////

function LB_OutputBuffCol(event, type) {
  if (event.match(/シールドウォール|ブレイバー|ビッグショット|スカイシャード|癒しの風/) && (type == AC_ACTION || type == AC_EFFECT || type == AC_LOSE_EFFECT)) {
    return 1;
  } else if (event.match(/マイティガード|ブレードダンス|デスペラード|プチメテオ|大地の息吹/) && (type == AC_ACTION || type == AC_EFFECT || type == AC_LOSE_EFFECT)) {
    return 2;
  } else if(event.match(/ラストバスティオン|原初の大地|ダークフォース|ファイナルヘヴン|蒼天のドラゴンダイブ|月遁血祭|サジタリウスアロー|サテライトビーム|メテオ|テラフレア|生命の鼓動|エンジェルフェザー|星天開門/)
            && (type == AC_ACTION || type == AC_EFFECT || type == AC_LOSE_EFFECT)) {
    return 3;
  }
  
  return 0;
}