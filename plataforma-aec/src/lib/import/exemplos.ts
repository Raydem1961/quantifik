/** Arquivos de exemplo (fictícios) usados no modo demonstração e nos testes. */

export const IFC_EXEMPLO = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('modelo.ifc','2026-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#3=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#10=IFCWALLSTANDARDCASE('g1',$,'Parede 1',$,'Alvenaria 15cm',$,$,'1');
#11=IFCWALLSTANDARDCASE('g2',$,'Parede 2; com ponto e v\\X2\\00ED\\X0\\rgula',$,'Alvenaria 15cm',$,$,'2');
#12=IFCSLAB('g3',$,'Laje T\\X2\\00E9\\X0\\rreo',$,'Laje maci\\X2\\00E7\\X0\\a 12cm',$,$,'3',.FLOOR.);
#13=IFCPIPESEGMENT('g4',$,'Tubo',$,$,$,$,'4');
#14=IFCDOOR('g5',$,'P1',$,'Porta 80x210',$,$,'5',2100.,800.);
#15=IFCPIPESEGMENTTYPE('t1',$,'PVC DN100',$,$,$,$,$,$,.RIGIDSEGMENT.);
#16=IFCRELDEFINESBYTYPE('r0',$,$,$,(#13),#15);
#20=IFCQUANTITYAREA('NetSideArea',$,$,30.);
#21=IFCQUANTITYAREA('GrossSideArea',$,$,33.);
#22=IFCQUANTITYVOLUME('NetVolume',$,$,6.);
#23=IFCQUANTITYLENGTH('Length',$,$,10000.);
#24=IFCELEMENTQUANTITY('q1',$,'BaseQuantities',$,$,(#20,#21,#22,#23));
#25=IFCRELDEFINESBYPROPERTIES('r1',$,$,$,(#10),#24);
#30=IFCQUANTITYAREA('NetSideArea',$,$,22.5);
#31=IFCQUANTITYVOLUME('NetVolume',$,$,4.5);
#32=IFCQUANTITYLENGTH('Length',$,$,7500.);
#33=IFCELEMENTQUANTITY('q2',$,'BaseQuantities',$,$,(#30,#31,#32));
#34=IFCRELDEFINESBYPROPERTIES('r2',$,$,$,(#11),#33);
#40=IFCQUANTITYAREA('NetArea',$,$,100.);
#41=IFCQUANTITYVOLUME('NetVolume',$,$,12.);
#42=IFCELEMENTQUANTITY('q3',$,'BaseQuantities',$,$,(#40,#41));
#43=IFCRELDEFINESBYPROPERTIES('r3',$,$,$,(#12),#42);
#50=IFCQUANTITYLENGTH('Length',$,$,6000.);
#51=IFCELEMENTQUANTITY('q4',$,'BaseQuantities',$,$,(#50));
#52=IFCRELDEFINESBYPROPERTIES('r4',$,$,$,(#13),#51);
ENDSEC;
END-ISO-10303-21;
`;

export const EPANET_EXEMPLO = `[TITLE]
Rede de distribuicao - exemplo

[JUNCTIONS]
;ID   Elev  Demand
N1    100   1.2
N2    98    0.8
N3    95    1.5

[RESERVOIRS]
R1    130

[TANKS]
;ID  Elev InitLvl MinLvl MaxLvl Diam MinVol
T1   120  3       1      6      10   0

[PIPES]
;ID  Node1 Node2 Length Diam Rough
P1   R1    N1    420    150  140
P2   N1    N2    200    100  140
P3   N2    N3    150    99.8 140   ; diametro interno

[VALVES]
;ID Node1 Node2 Diam Type Setting
V1  N2    N3    100  PRV  30

[OPTIONS]
Units LPS
Headloss H-W
`;

export const SWMM_EXEMPLO = `[OPTIONS]
FLOW_UNITS LPS

[JUNCTIONS]
;Name Elev MaxDepth
PV1   100  1.20
PV2   99   1.45
PV3   97   2.10

[OUTFALLS]
EX1   95   FREE

[CONDUITS]
;Name From To  Length Rough
C1    PV1  PV2 70     0.013
C2    PV2  PV3 60     0.013
C3    PV3  EX1 80     0.013

[XSECTIONS]
;Link Shape    Geom1
C1    CIRCULAR 0.15  0 0 0 1
C2    CIRCULAR 0.15  0 0 0 1
C3    CIRCULAR 0.20  0 0 0 1
`;

export const LANDXML_EXEMPLO = `<?xml version="1.0"?>
<LandXML version="1.2">
  <Units><Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" diameterUnit="meter"/></Units>
  <Parcels>
    <Parcel name="Q1-L01" area="360" parcelType="Lote"/>
    <Parcel name="Q1-L02" area="390" parcelType="Lote"/>
    <Parcel name="AV1" area="1200" parcelType="Área Verde"/>
  </Parcels>
  <Alignments>
    <Alignment name="Rua A" length="240.5" staStart="0"><CoordGeom/></Alignment>
  </Alignments>
  <Surfaces>
    <Surface name="TN"><Definition surfType="TIN" area2DSurf="52000" area3DSurf="52480.3" elevMax="131.2" elevMin="118.4"><Pnts/></Definition></Surface>
    <SurfVolumes><SurfVolume surfBase="TN" surfCompare="PLATO" volCut="1520.5" volFill="980.25"/></SurfVolumes>
  </Surfaces>
  <PipeNetworks>
    <PipeNetwork name="Drenagem" pipeNetType="storm">
      <Structs>
        <Struct name="PV-01" elevRim="120.0" elevSump="118.2" desc="Poço de visita"><CircStruct diameter="1.2"/></Struct>
      </Structs>
      <Pipes>
        <Pipe name="T-01" refStart="PV-01" refEnd="PV-02" length="85" slope="0.01"><CircPipe diameter="0.6" material="Concreto"/></Pipe>
      </Pipes>
    </PipeNetwork>
  </PipeNetworks>
</LandXML>
`;

export const PONTOS_EXEMPLO = `P1,8560000.000,550000.000,100.00,CERCA
P2,8560000.000,550200.000,101.20,CERCA
P3,8560100.000,550200.000,104.50,CERCA
P4,8560100.000,550000.000,102.00,CERCA
P5,8560050.000,550100.000,102.30,TN
P6,8560020.000,550050.000,101.00,TN
`;

export const TABELA_EXEMPLO = `Tabela de quantitativos exportada
Código;Descrição;Unidade;Quantidade
C-001;Concreto fck 25 MPa;m³;42,5
;Alvenaria de bloco cerâmico 14 cm;m²;310
;Porta de madeira 80x210;un;12
;Subtotal;;
`;

/** Reproduz peculiaridades reais do exportador IFC do Revit (ver testes). */
export const IFC_REVIT_QUIRKS = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#3=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#4=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#5=IFCUNITASSIGNMENT((#1,#3,#4));
#10=IFCWALLSTANDARDCASE('w1',$,'Parede',$,'Basic Wall:Externa 54cm',$,$,'1');
#11=IFCQUANTITYLENGTH('Height',$,$,2534.6);
#12=IFCQUANTITYLENGTH('Length',$,$,22600.);
#13=IFCQUANTITYVOLUME('NetVolume',$,$,30932711431.217);
#14=IFCQUANTITYAREA('NetSideArea',$,$,57282798.9466982);
#15=IFCQUANTITYAREA('NetSideArea',$,$,48.0210989466982);
#16=IFCQUANTITYVOLUME('NetVolume',$,$,25.1098377156085);
#17=IFCELEMENTQUANTITY('q1',$,'BaseQuantities',$,$,(#11,#12,#13,#14,#15,#16));
#18=IFCRELDEFINESBYPROPERTIES('r1',$,$,$,(#10),#17);
#20=IFCSLAB('s1',$,'Telhado',$,'Basic Roof:Telha',$,$,'2',.ROOF.);
#21=IFCQUANTITYAREA('GrossArea',$,$,12.19);
#22=IFCQUANTITYAREA('NetArea',$,$,527.61);
#23=IFCELEMENTQUANTITY('q2',$,'BaseQuantities',$,$,(#21,#22));
#24=IFCRELDEFINESBYPROPERTIES('r2',$,$,$,(#20),#23);
#30=IFCOPENINGELEMENT('o1',$,'Opening',$,'Opening',$,$,'3');
#31=IFCQUANTITYAREA('Area',$,$,2.1);
#32=IFCELEMENTQUANTITY('q3',$,'BaseQuantities',$,$,(#31));
#33=IFCRELDEFINESBYPROPERTIES('r3',$,$,$,(#30),#32);
#40=IFCWALLSTANDARDCASE('w2',$,'Parede 2',$,'Basic Wall:Interna',$,$,'4');
#41=IFCQUANTITYAREA('NetSideArea',$,$,57282798.9);
#42=IFCELEMENTQUANTITY('q4',$,'BaseQuantities',$,$,(#41));
#43=IFCRELDEFINESBYPROPERTIES('r4',$,$,$,(#40),#42);
ENDSEC;
END-ISO-10303-21;
`;
