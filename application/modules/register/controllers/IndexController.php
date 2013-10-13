<?php

class Register_IndexController extends Zend_Controller_Action {
    
    public function indexAction() {
        $this->view->formRegistro = $form = new Mob_Form_Registro;
        
        $request = $this->getRequest();
        
        if ($request->isPost()) {
          if ($form->isValid($request->getPost())) {
          
            $usuarios = new Mob_Model_Usuarios;

            $usuarios->insert(array(
                          "usuario" => $form->user->getValue(),
                          "pass" => $form->pass->getValue(),
                          "email" => $form->email->getValue(),
                          "rutas" => unique_random(2,4),
                          "encargos" => unique_random(2,5),
                          "extorsion" => unique_random(4,7),
                          "administracion" => unique_random(1,4),
                          "contrabando" => unique_random(8,12),
                          "espionaje" => unique_random(5, 9),  
                          "seguridad" => unique_random(5,9),
                          "proteccion" => unique_random(5,9),
                          "combate" => unique_random(4,6),
                          "tiro" => unique_random(4,6),
                          "explosivos" => unique_random(4,6),
                          "guerrilla" => unique_random(4,6),
                          "psicologico" => unique_random(4,6),
                          "quimico" => unique_random(4,6),
                          "honor" => unique_random(1,2)
                        ));
                        
            $id_usuario = Zend_Db_Table_Abstract::getDefaultAdapter()->lastInsertId();
                        
            $edificio = new Mob_Model_Edificios;
            
            for ($i=1; $i<=20; $i++) {           
              $edificio->insert(array("usuario" => $id_usuario,
              "coordenadas" => $i, 
              "oficina" => unique_random(10,15),
              "escuela" => unique_random(2,4),
              "armeria" => unique_random(15,20),
              "municion" => unique_random(25,30),
              "cerveceria" => unique_random(4,8),
              "taberna" => unique_random(5,9),
              "contrabando" => unique_random(2,4),
              "almacen_arm" => unique_random(4,5),
              "deposito" => unique_random(6,7),
              "almacen_alc" => unique_random(3,6),
              "caja" => unique_random(5,8),
              "campo" => unique_random(3,9),
              "seguridad" => unique_random(1,4),
              "torreta" => unique_random(1,5),
              "minas" => unique_random(1,5),
              "recursos_ar" => unique_random(2,5)*10000,
              "recursos_mun" => unique_random(4,8)*10000,
              "recursos_alc" => unique_random(5,10)*10000,
              "recursos_dol" => unique_random(1,4)*10000));
            }
            
            $this->_redirect("/");
          
          }
        }
    }

}

 function unique_random($Min,$Max,$num=1){
    //this will swap min an max values if $Min>$Max

    if ($Min>$Max) { $min=$Max; $max=$Min; }
    else { $min=$Min; $max=$Max; }

    //this will avoid to enter a number of results greater than possible results
    if ($num>($max-$min)) $num=($max-$min);

    $values=array();
    $result=array();

    for ($i=$min;$i<=$max;$i++) {

      $values[]=$i;

    }

    for ($j=0;$j<$num;$j++){

      $key=mt_rand(0,count($values)-1);

      $result[]=$values[$key];

      unset($values[$key]);

      sort($values);

    }

    return $result[0];

}