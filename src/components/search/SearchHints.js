import React from 'react';
import { Link } from 'gatsby';

import { makeStyles } from '@material-ui/core/styles';
import { FormatQuote, KeyboardArrowRight } from '@material-ui/icons';
import { List, ListSubheader, ListItem, ListItemIcon, ListItemText, Divider, Button } from '@material-ui/core';

export default function SearchHints ({ searchUpdate }) {
    const classes = useStyles();
    return (
        <List subheader={<ListSubheader>Try searching for...</ListSubheader>}>
            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon} >
                    {/* <MenuBook />  */}
                    <span role="img" aria-label="book">📖</span>
                </ListItemIcon>
                <ListItemText 
                    primary="Bible references"
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?query=Prov%2025:2'} onClick={() => {searchUpdate('Prov 25:2')}}>Prov&nbsp;25:2</Link>{', '}
                        <Link to={'/?query=Acts%2013'} onClick={() => {searchUpdate('Acts 13')}}>Acts&nbsp;13</Link>{', '}
                        <Link to={'/?query=John%203:16'} onClick={() => {searchUpdate('John 3:16')}}>John&nbsp;3:16</Link>
                    </>}
                />
                <Button component={Link} to="/passages" disableRipple color="primary" >Browse<KeyboardArrowRight /></Button>
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    <FormatQuote/>
                </ListItemIcon>
                <ListItemText 
                    primary="Words or phrases" 
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?query=in%20the%20beginning'} onClick={() => {searchUpdate('in the beginning')}}>"in the beginning"</Link>{', '}
                        <Link to={'/?query=search%20the%20scriptures'} onClick={() => {searchUpdate('search the scriptures')}}>"search the scriptures"</Link>
                    </>}
                />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    {/* <PeopleAlt/>  */}
                    <span role="img" aria-label="people">👥</span>
                </ListItemIcon>
                <ListItemText 
                    primary="People" 
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?query=Abraham'} state={{ searchInput: 'Abraham' }} onClick={() => {searchUpdate('Abraham')}}>Abraham</Link>{', '}
                        <Link to={'/?query=Saul'} onClick={() => {searchUpdate('Saul')}}>Saul</Link>{', '}
                        <Link to={'/?query=Zechariah'} onClick={() => {searchUpdate('Zechariah')}}>Zechariah</Link>
                    </>}
                />
                <Button component={Link} to="/people" disableRipple color="primary" >Browse<KeyboardArrowRight /></Button>
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    {/* <Place/>  */}
                    <span role="img" aria-label="places">📍</span>
                </ListItemIcon>
                <ListItemText 
                    primary="Places"
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?query=Bethlehem'} onClick={() => {searchUpdate('Bethlehem')}}>Bethlehem</Link>,&nbsp;
                        <Link to={'/?query=Antioch'} onClick={() => {searchUpdate('Antioch')}}>Antioch</Link>
                    </>}
                />
                <Button component={Link} to="/places" disableRipple color="primary" >Browse<KeyboardArrowRight /></Button>
            </ListItem>
        </List>
    );
}

const useStyles = makeStyles(theme => ({
    icon: {
        color:"#000",
        minWidth: 36,
        marginTop: 6,
    }
  }));